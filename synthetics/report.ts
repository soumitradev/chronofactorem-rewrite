import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { type Change, changesBetween, groupRepeats } from "./changes.ts";
import { synthetics } from "./synthetics.ts";

const {
  GITHUB_REPOSITORY,
  GITHUB_STEP_SUMMARY,
  PR_NUMBER,
  BASELINE,
  IMAGES_REF = "synthetics/images",
} = process.env;
const shotsDir = resolve(import.meta.dirname, "screenshots");
const MARKER = "<!-- synthetics-report -->";

const gh = (args: string[], input?: string) =>
  execFileSync("gh", args, { input, encoding: "utf8" });

const stderrOf = (error: unknown) =>
  error instanceof Error && "stderr" in error ? String(error.stderr) : "";

// non-branch ref so clones never fetch images; append-only with hash names
// and pinned commit URLs so old reports keep resolving
const REF = `refs/${IMAGES_REF}`;
const git = (
  args: string[],
  options: { input?: string | Buffer; env?: Record<string, string> } = {},
) =>
  execFileSync("git", args, {
    input: options.input,
    env: { ...process.env, ...options.env },
    maxBuffer: 1 << 30,
    stdio: "pipe",
  });

// store is blobless, so cat-file fetches only this blob
const read = (commit: string, path: string) =>
  git(["ls-tree", "--full-tree", commit, "--", path]).length
    ? git(["cat-file", "blob", `${commit}:${path}`])
    : undefined;

const sha256 = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const chunks = (png: Buffer) => {
  const out: { type: string; data: Buffer }[] = [];
  for (let offset = PNG_SIGNATURE.length; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    out.push({
      type: png.toString("latin1", offset + 4, offset + 8),
      data: png.subarray(offset + 8, offset + 8 + length),
    });
    offset += length + 12;
  }
  return out;
};
const chunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
};

const BLINK_MS = 800;
const LABEL_HEIGHT = 32;
const LABELS = [
  { text: "before", background: "#57606a" },
  { text: "after", background: "#0969da" },
];
const label = (width: number, { text, background }: (typeof LABELS)[number]) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_HEIGHT}">` +
      `<rect width="100%" height="100%" fill="${background}"/>` +
      `<text x="12" y="21" fill="#ffffff" font-family="sans-serif" font-size="15" font-weight="bold">${text}</text>` +
      "</svg>",
  );
// apng because raw.githubusercontent.com only serves .png as an image and
// github's proxy drops webp/gif; sharp can't write apng so we mux its frames
const blinkImage = async (before: Buffer, after: Buffer) => {
  const sizes = await Promise.all(
    [before, after].map((png) => sharp(png).metadata()),
  );
  const width = Math.max(...sizes.map((size) => size.width));
  const height = LABEL_HEIGHT + Math.max(...sizes.map((size) => size.height));
  const frames = await Promise.all(
    [before, after].map(async (png, i) =>
      chunks(
        await sharp(png)
          .removeAlpha()
          .toColourspace("srgb")
          .extend({
            top: LABEL_HEIGHT,
            right: width - sizes[i].width,
            bottom: height - LABEL_HEIGHT - sizes[i].height,
            background: "#ffffff",
          })
          .composite([{ input: label(width, LABELS[i]), top: 0, left: 0 }])
          .png({ compressionLevel: 9 })
          .toBuffer(),
      ),
    ),
  );
  const [ihdr, otherIhdr] = frames.map((frame) => {
    const header = frame.find(({ type }) => type === "IHDR")?.data;
    if (!header) throw new Error("missing IHDR chunk");
    return header;
  });
  if (!ihdr.equals(otherIhdr)) throw new Error("blink frames don't match");
  let sequence = 0;
  const frameControl = () => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence++);
    data.writeUInt32BE(width, 4);
    data.writeUInt32BE(height, 8);
    // delay fraction in ms; zeroed bytes leave 0,0 offset and replace-frame blend
    data.writeUInt16BE(BLINK_MS, 20);
    data.writeUInt16BE(1000, 22);
    return chunk("fcTL", data);
  };
  // num_plays left 0 to loop forever
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(frames.length);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("acTL", animation),
    ...frames.flatMap((frame, i) => [
      frameControl(),
      ...frame
        .filter(({ type }) => type === "IDAT")
        .map(({ data }) => {
          // frame 0 is standard IDAT, later frames are sequenced fdAT
          if (!i) return chunk("IDAT", data);
          const number = Buffer.alloc(4);
          number.writeUInt32BE(sequence++);
          return chunk("fdAT", Buffer.concat([number, data]));
        }),
    ]),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

type Manifest = Record<string, string>;

const fetchStore = (...extraArgs: string[]) => {
  try {
    git([
      "fetch",
      "--quiet",
      ...extraArgs,
      "--filter=blob:none",
      "origin",
      `+${REF}:${REF}`,
    ]);
    return true;
  } catch (error) {
    if (stderrOf(error).includes("couldn't find remote ref")) return false;
    throw error;
  }
};

const tip = () =>
  fetchStore("--depth=1")
    ? { commit: git(["rev-parse", REF]).toString().trim() }
    : undefined;

// walk the blobless store history for the newest baseline at or before the
// PR's branch point so later master merges aren't blamed on the PR
const mergeBase = (head: string) => {
  if (!fetchStore()) return undefined;
  const base = git(["merge-base", head, "origin/master"]).toString().trim();
  for (const line of git(["log", "--format=%H %s", REF])
    .toString()
    .split("\n")) {
    // skip PR screenshot commits interleaved on the same ref
    const [, commit, source] = line.match(/^(\w+) baseline from (\w+)$/) ?? [];
    if (!source) continue;
    if (
      spawnSync("git", ["merge-base", "--is-ancestor", source, base], {
        stdio: "ignore",
      }).status === 0
    ) {
      return { commit };
    }
  }
  return undefined;
};

const readManifest = (commit: string | undefined): Manifest => {
  const file = commit && read(commit, "manifest.json");
  return file ? JSON.parse(file.toString()) : {};
};

const BOT = {
  name: "github-actions[bot]",
  email: "41898282+github-actions[bot]@users.noreply.github.com",
};
// batch into one git push with retry (per-image API calls hit github rate limits)
const store = (files: Map<string, Buffer>, message: string) => {
  const blobs = [...files].map(([path, data]) => ({
    path,
    sha: git(["hash-object", "-w", "--stdin"], { input: data })
      .toString()
      .trim(),
  }));
  const dir = mkdtempSync(join(tmpdir(), "synthetics-"));
  const env = {
    GIT_INDEX_FILE: join(dir, "index"),
    GIT_AUTHOR_NAME: BOT.name,
    GIT_AUTHOR_EMAIL: BOT.email,
    GIT_COMMITTER_NAME: BOT.name,
    GIT_COMMITTER_EMAIL: BOT.email,
  };
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      const parent = tip();
      const stored = new Set(
        parent
          ? git(["ls-tree", "--full-tree", "-r", "--name-only", parent.commit])
              .toString()
              .split("\n")
          : [],
      );
      const fresh = blobs.filter(
        ({ path }) => path === "manifest.json" || !stored.has(path),
      );
      if (parent && !fresh.length) return parent.commit;
      rmSync(env.GIT_INDEX_FILE, { force: true });
      if (parent) git(["read-tree", parent.commit], { env });
      git(["update-index", "--index-info"], {
        env,
        input: fresh
          .map(({ path, sha }) => `100644 ${sha}\t${path}`)
          .join("\n"),
      });
      const tree = git(["write-tree"], { env }).toString().trim();
      const commit = git(
        [
          "commit-tree",
          tree,
          ...(parent ? ["-p", parent.commit] : []),
          "-m",
          message,
        ],
        { env },
      )
        .toString()
        .trim();
      try {
        git(["push", "--quiet", "origin", `${commit}:${REF}`]);
        return commit;
      } catch (error) {
        if (!/rejected|fetch first|non-fast-forward/.test(stderrOf(error))) {
          throw error;
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  throw new Error(`couldn't move ${REF}`);
};

const shots = new Map(
  readdirSync(shotsDir, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".png"))
    .sort()
    .map((path) => {
      const data = readFileSync(resolve(shotsDir, path));
      return [path, { data, hash: sha256(data) }];
    }),
);

const isBaseline = BASELINE === "true";
const parent = isBaseline ? tip() : mergeBase(process.env.HEAD_SHA || "HEAD");
const baseline = readManifest(parent?.commit);
const noBaseline = !isBaseline && !Object.keys(baseline).length;
const changed = [...shots].filter(
  ([path, { hash }]) => baseline[path] && baseline[path] !== hash,
);
const added = [...shots].filter(([path]) => !baseline[path]);
const removed = Object.keys(baseline).filter((path) => !shots.has(path));
const unchanged = shots.size - changed.length - added.length;
const hasChanges = Boolean(changed.length || added.length || removed.length);

const files = new Map<string, Buffer>();
for (const [, { data, hash }] of noBaseline ? [] : [...changed, ...added]) {
  files.set(`img/${hash}.png`, data);
}
const blinks = new Map<string, string>();
const changes = new Map<string, Change[]>();
// skip slow blink/diff work on master since the PR already showed these changes
const details = !isBaseline;
await Promise.all(
  (details ? changed : []).map(async ([path, { data, hash }]) => {
    const name = `blink/${baseline[path]}-${hash}.png`;
    const before = parent
      ? read(parent.commit, `img/${baseline[path]}.png`)
      : undefined;
    if (!before)
      throw new Error(`no img/${baseline[path]}.png in refs/${IMAGES_REF}`);
    files.set(name, await blinkImage(before, data));
    blinks.set(path, name);
    changes.set(path, await changesBetween(before, data));
  }),
);
if (isBaseline && hasChanges) {
  const manifest = Object.fromEntries(
    [...shots].map(([path, { hash }]) => [path, hash]),
  );
  files.set(
    "manifest.json",
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  );
}

const commit = files.size
  ? store(
      files,
      isBaseline
        ? `baseline from ${process.env.GITHUB_SHA}`
        : `screenshots for #${PR_NUMBER} at ${process.env.HEAD_SHA}`,
    )
  : parent?.commit;

const url = (path: string) =>
  `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${commit}/${path}`;
const image = (path: string) =>
  `<a href="${url(path)}"><img src="${url(path)}"></a>`;
const name = (path: string) => {
  const [synthetic, device] = path.replace(/\.png$/, "").split("/");
  return `\`${synthetic}\` · ${device}`;
};

const routes = new Map(
  synthetics.map((synthetic, order) => [
    synthetic.name,
    {
      route: synthetic.url.replace(/\{[\w-]+\}/g, ":id").split("?")[0],
      order,
    },
  ]),
);
const byRoute = <T>(items: T[], pathOf: (item: T) => string) => {
  const of = (item: T) => routes.get(pathOf(item).split("/")[0]);
  const sorted = [...items].sort(
    (left, right) =>
      (of(left)?.order ?? routes.size) - (of(right)?.order ?? routes.size) ||
      pathOf(left).localeCompare(pathOf(right)),
  );
  const groups = new Map<string, T[]>();
  for (const item of sorted) {
    const route = of(item)?.route ?? "removed synthetics";
    groups.set(route, [...(groups.get(route) ?? []), item]);
  }
  return groups;
};
// headings instead of a markdown table, which shrinks images to thumbnails
const section = <T>(
  items: T[],
  pathOf: (item: T) => string,
  imageOf: (item: T) => string,
  noteOf?: (item: T) => string,
) =>
  [...byRoute(items, pathOf)].flatMap(([route, group]) => [
    `### \`${route}\``,
    "",
    ...group.flatMap((item) => [
      `#### ${name(pathOf(item))}`,
      "",
      ...(noteOf ? [noteOf(item), ""] : []),
      image(imageOf(item)),
      "",
    ]),
  ]);

const folded = (summary: string, body: string[]) => [
  `<details><summary>${summary}</summary>`,
  "",
  ...body,
  "</details>",
  "",
];

const changedByRoute = byRoute(changed, ([path]) => path);
const grouped = groupRepeats(
  [...changedByRoute.values()]
    .flat()
    .map(([path]) => ({ item: path, changes: changes.get(path) ?? [] })),
);
const blinkOf = (path: string) => {
  const blink = blinks.get(path);
  if (!blink) throw new Error(`missing blink image for ${path}`);
  return blink;
};

const lines = [MARKER, "## Screenshots", ""];
if (noBaseline) {
  lines.push("No baseline to compare against yet, it's made when master runs.");
} else if (!hasChanges) {
  lines.push(`No visual changes across ${shots.size} screenshots.`);
} else {
  lines.push(
    [
      changed.length && `**${changed.length} changed**`,
      added.length && `${added.length} new`,
      removed.length && `${removed.length} removed`,
      `${unchanged} unchanged`,
    ]
      .filter(Boolean)
      .join(" · "),
    "",
  );
  if (changed.length) {
    lines.push(
      [...changedByRoute]
        .map(([route, group]) => `\`${route}\` ${group.length}`)
        .join(" · "),
      "",
    );
  }
  if (details) {
    if (changed.length) {
      lines.push(...section(grouped.shown, (path) => path, blinkOf));
    }
    if (grouped.repeats.length) {
      lines.push(
        ...folded(
          `Same changes as above (${grouped.repeats.length})`,
          section(
            grouped.repeats,
            ({ item }) => item,
            ({ item }) => blinkOf(item),
            ({ of }) => `Repeats ${name(of)}`,
          ),
        ),
      );
    }
    if (grouped.tiny.length) {
      lines.push(
        ...folded(
          `Tiny changes, possibly noise (${grouped.tiny.length})`,
          section(grouped.tiny, (path) => path, blinkOf),
        ),
      );
    }
    if (added.length) {
      lines.push(
        ...folded(
          "New",
          section(
            added,
            ([path]) => path,
            ([, { hash }]) => `img/${hash}.png`,
          ),
        ),
      );
    }
    if (removed.length) {
      lines.push(
        ...folded(
          "Removed",
          section(
            removed,
            (path) => path,
            (path) => `img/${baseline[path]}.png`,
          ),
        ),
      );
    }
  }
}
const report = lines.join("\n");
if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${report}\n`);
console.log(report);

if (PR_NUMBER) {
  const existing = gh([
    "api",
    "--paginate",
    `repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`,
    "--jq",
    `.[] | select(.user.type == "Bot" and (.body // "" | startswith("${MARKER}"))) | .id`,
  ])
    .trim()
    .split("\n")[0];
  if (existing) {
    gh(
      [
        "api",
        "-X",
        "PATCH",
        `repos/${GITHUB_REPOSITORY}/issues/comments/${existing}`,
        "--input",
        "-",
      ],
      JSON.stringify({ body: report }),
    );
  } else if (!noBaseline && hasChanges) {
    gh(
      [
        "api",
        "-X",
        "POST",
        `repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`,
        "--input",
        "-",
      ],
      JSON.stringify({ body: report }),
    );
  }
}
