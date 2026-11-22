import { type ChildProcess, spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { chromium, devices, type Page } from "playwright";
import sharp from "sharp";
import { build, preview } from "vite";
import scenario from "../backend/src/seed/scenarios/starter-pack.json" with {
  type: "json",
};
import { type Part, setTheme, synthetics, THEMES } from "./synthetics.ts";

const root = resolve(import.meta.dirname, "..");
const backendDir = resolve(root, "backend");
const frontendDir = resolve(root, "frontend");
const outDir = resolve(import.meta.dirname, "screenshots");

// overridable so parallel runs on one machine don't collide
const BACKEND_PORT = Number(process.env.SYNTHETICS_BACKEND_PORT ?? 3999);
const FRONTEND_PORT = Number(process.env.SYNTHETICS_FRONTEND_PORT ?? 4999);
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const API = `http://localhost:${BACKEND_PORT}`;

// fixed browser clock matching timestamps pinned in starter-pack.json
const NOW = new Date("2026-10-14T10:30:00+05:30");

// tightest tailwind breakpoints per form factor (<sm, md/<lg, xl/<2xl)
// rendered at 1x deviceScaleFactor below to keep pngs small
const DEVICES = {
  "iphone-15": devices["iPhone 15"],
  "ipad-mini": devices["iPad Mini"],
  "laptop-1366": { viewport: { width: 1366, height: 768 } },
};

// guard against dropping a real db since each run drops and recreates this
const DB_NAME = process.env.SYNTHETICS_DB ?? "chrono_synthetics";
if (!/^[a-z0-9_]*synthetics[a-z0-9_]*$/.test(DB_NAME)) {
  console.error(
    `SYNTHETICS_DB=${DB_NAME}: use lowercase letters, digits and underscores, and include "synthetics", since the run drops it`,
  );
  process.exit(1);
}
const rawShard = process.env.SHARD ?? "1/1";
const shardMatch = /^([1-9]\d*)\/([1-9]\d*)$/.exec(rawShard);
const shard = Number(shardMatch?.[1]);
const shards = Number(shardMatch?.[2]);
if (!shardMatch || shard > shards) {
  console.error(
    `SHARD=${rawShard}: expected i/n with positive integers and 1 <= i <= n`,
  );
  process.exit(1);
}
const server = {
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
};
const admin = {
  ...server,
  user: process.env.POSTGRES_USER ?? "chrono",
  password: process.env.POSTGRES_PASSWORD ?? "chrono",
  database: "postgres",
};
// backend ignores POSTGRES_DB and connects to the db named after POSTGRES_USER
const db = { ...server, user: DB_NAME, password: DB_NAME, database: DB_NAME };

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
});
const backendEnv = {
  ...process.env,
  NODE_ENV: "development",
  LOGIN_AS: "true",
  LOG_LEVEL: "warn",
  POSTGRES_USER: db.user,
  POSTGRES_PASSWORD: db.password,
  POSTGRES_DB: DB_NAME,
  DB_HOST: db.host,
  PGPORT: String(db.port),
  BACKEND_PORT: String(BACKEND_PORT),
  BACKEND_URL: `${FRONTEND_URL}/api`,
  FRONTEND_URL,
  LOGTO_ENDPOINT: "http://localhost",
  LOGTO_APP_ID: "synthetics",
  LOGTO_APP_SECRET: "synthetics",
  JWT_PRIVATE_KEY: Buffer.from(keys.privateKey).toString("base64"),
  JWT_PUBLIC_KEY: Buffer.from(keys.publicKey).toString("base64"),
  SQIDS_ALPHABET:
    "P1fF29hw8BARdJpoSUZIDnXVWNzcCeGrlgk0qbsMxjYKaE5uLTyOt376Hmv4Qi",
  CHRONO_SECRET: "synthetics",
};

const sql = async (query: string, as = db) => {
  const client = new pg.Client(as);
  await client.connect();
  try {
    return await client.query(query);
  } finally {
    await client.end();
  }
};

const backendScript = (script: string, args: string[] = []) =>
  spawn("pnpm", ["exec", "tsx", script, ...args], {
    cwd: backendDir,
    env: backendEnv,
    stdio: ["ignore", "pipe", "inherit"],
    // own process group so process.kill(-pid) also kills tsx's node child
    detached: true,
  });

const seed = async () => {
  const child = backendScript("src/seed.ts", ["starter-pack"]);
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  const code = await new Promise((done) => child.on("exit", done));
  if (code !== 0) throw new Error(`seed failed:\n${output}`);
  const seeded: { timetables: Record<string, string> } = JSON.parse(
    output.trim().split("\n").at(-1) ?? "",
  );
  return seeded.timetables;
};

// fail fast if a port is taken so we don't shoot another run's server
const ensureFree = (port: number, variable: string) =>
  new Promise<void>((done, fail) => {
    const probe = createServer()
      .once("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EADDRINUSE") return fail(error);
        console.error(
          `port ${port} is already in use, set ${variable} to a free port`,
        );
        process.exit(1);
      })
      .once("listening", () => probe.close(() => done()))
      .listen(port);
  });

const waitForBackend = async (backend: ChildProcess) => {
  for (let i = 0; i < 120; i++) {
    if (backend.exitCode !== null) throw new Error("backend exited");
    try {
      await fetch(`${API}/auth/check`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("backend never came up");
};

// faster than playwright's 500ms networkidle and waits for react DOM updates too
const QUIET_MS = 100;
const trackRequests = async (page: Page) => {
  await page.addInitScript(() => {
    window.lastMutation = performance.now();
    new MutationObserver(() => {
      window.lastMutation = performance.now();
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  let inflight = 0;
  let last = performance.now();
  const done = () => {
    inflight--;
    last = performance.now();
  };
  page.on("request", () => {
    inflight++;
  });
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return async () => {
    const start = performance.now();
    for (;;) {
      if (performance.now() - start > 30_000) {
        throw new Error(`${page.url()} never settled`);
      }
      if (inflight === 0 && performance.now() - last >= QUIET_MS) {
        // keep waiting while loading skeletons are mounted
        const domQuiet = await page.evaluate(() =>
          document.querySelector("[data-skeleton]")
            ? 0
            : performance.now() - window.lastMutation,
        );
        if (domQuiet >= QUIET_MS && inflight === 0) return;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  };
};

const GAP = 32;
const sideBySide = async (shots: Buffer[], path: string) => {
  const sizes = await Promise.all(shots.map((shot) => sharp(shot).metadata()));
  let left = 0;
  const placed = shots.map((input, i) => {
    const tile = { input, left, top: 0 };
    left += sizes[i].width + GAP;
    return tile;
  });
  mkdirSync(dirname(path), { recursive: true });
  await sharp({
    create: {
      width: left - GAP,
      height: Math.max(...sizes.map((size) => size.height)),
      channels: 3,
      background: "#808080",
    },
  })
    .composite(placed)
    // opaque pngs compress smaller at level 9 than chromium's output
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path);
};

// keep hidden parts' layout box intact and hatch over them instead of collapsing
const hiding = (parts: Part[] = []) =>
  parts
    .map(
      (part) => `
        [data-shot="${part}"] {
          background: repeating-linear-gradient(
            135deg, rgb(128 128 128 / 0.25) 0 6px, transparent 6px 14px
          ) !important;
        }
        [data-shot="${part}"] > * { visibility: hidden !important; }`,
    )
    .join("");

type Pinned = {
  el: HTMLElement;
  left: number;
  snap: string;
  children: { child: HTMLElement; translate: string; transition: string }[];
};

declare global {
  interface Window {
    lastMutation: number;
    pinned?: Pinned[];
    shooting?: boolean;
  }
}

// chrome's fullPage capture can reset horizontal scrollLeft (e.g. phone tab
// track), so freeze the offset as a translate while shooting
const pinScroll = (page: Page) =>
  page.evaluate(() => {
    window.shooting = true;
    window.pinned = [];
    for (const el of document.querySelectorAll<HTMLElement>("*")) {
      const left = el.scrollLeft;
      if (left === 0) continue;
      const children = [...el.children].flatMap((child) =>
        child instanceof HTMLElement
          ? [
              {
                child,
                translate: child.style.translate,
                transition: child.style.transition,
              },
            ]
          : [],
      );
      window.pinned.push({ el, left, snap: el.style.scrollSnapType, children });
      el.style.scrollSnapType = "none";
      el.scrollLeft = 0;
      // reduced-motion still leaves a tiny transition that traps translate mid-flight
      for (const { child } of children) {
        child.style.transition = "none";
        child.style.translate = `${-left}px 0`;
      }
    }
  });
const unpinScroll = (page: Page) =>
  page.evaluate(() => {
    for (const { el, left, snap, children } of window.pinned ?? []) {
      for (const { child, translate } of children) {
        child.style.translate = translate;
        getComputedStyle(child).translate;
      }
      for (const { child, transition } of children) {
        child.style.transition = transition;
      }
      el.style.scrollSnapType = snap;
      el.scrollLeft = left;
    }
    window.pinned = [];
    window.shooting = false;
  });

// suppress scroll/resize/ResizeObserver while fullPage + pinScroll mutate the
// viewport, or the phone sheet and tab underline react mid-shot
const holdDuringShots = () => {
  const hold = (e: Event) => {
    if (window.shooting) e.stopImmediatePropagation();
  };
  for (const type of ["scroll", "scrollend", "resize"]) {
    window.addEventListener(type, hold, { capture: true });
  }
  // no virtual keyboard here, so any visualViewport resize is from screenshots
  window.visualViewport?.addEventListener("resize", (e) =>
    e.stopImmediatePropagation(),
  );
  const Native = window.ResizeObserver;
  window.ResizeObserver = class extends Native {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        if (!window.shooting) callback(entries, observer);
      });
    }
  };
};

const shoot = async (
  timetables: Record<string, string>,
  announcementIds: string[],
) => {
  const users = Object.fromEntries(scenario.users.map((u) => [u.key, u]));
  const browser = await chromium.launch({
    args: [
      "--disable-gpu",
      "--disable-partial-raster",
      "--disable-skia-runtime-opts",
      "--force-color-profile=srgb",
      "--font-render-hinting=none",
    ],
  });
  rmSync(outDir, { recursive: true, force: true });

  const jobs = synthetics.flatMap((synthetic) => {
    const url = synthetic.url.replace(/\{([\w-]+)\}/g, (_, key) => {
      if (!timetables[key]) {
        throw new Error(`${synthetic.name}: no timetable ${key}`);
      }
      return timetables[key];
    });
    const user =
      synthetic.as &&
      (users[synthetic.as] ?? { email: synthetic.as, name: "New Student" });
    return Object.entries(DEVICES).map(([device, options]) => ({
      synthetic,
      url,
      user,
      device,
      options,
    }));
  });
  const mine = jobs.filter((_, i) => i % shards === shard - 1);

  const run = async ({
    synthetic,
    url,
    user,
    device,
    options,
  }: (typeof jobs)[number]) => {
    const context = await browser.newContext({
      ...options,
      deviceScaleFactor: 1,
      baseURL: FRONTEND_URL,
      colorScheme: THEMES[0],
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      reducedMotion: "reduce",
    });
    await context.clock.setFixedTime(NOW);
    await context.addInitScript(() => {
      let seed = 1;
      Math.random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
    });
    await context.addInitScript(holdDuringShots);
    if (!synthetic.unreadAnnouncements) {
      await context.addInitScript((read) => {
        localStorage.setItem("readAnnouncements", read);
      }, JSON.stringify(announcementIds));
    }
    const page = await context.newPage();
    const settle = await trackRequests(page);
    if (user) {
      await context.request.get(
        `/api/auth/as?email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name)}`,
        { maxRedirects: 0 },
      );
    }
    await page.goto(url);
    await settle();
    if (synthetic.act) {
      await synthetic.act(page);
      await settle();
    }
    await page.evaluate(() => document.fonts.ready);
    // reuse one page load across themes since prefers-color-scheme updates live
    const shots: Buffer[] = [];
    for (const theme of THEMES) {
      if (theme !== THEMES[0]) {
        // wait for the theme class to land since the dom was already quiet
        await setTheme(page, theme);
        await settle();
      }
      await pinScroll(page);
      shots.push(
        await page.screenshot({
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          style: hiding(synthetic.hide),
        }),
      );
      await unpinScroll(page);
    }
    await context.close();
    await sideBySide(shots, resolve(outDir, synthetic.name, `${device}.png`));
    console.log(`shot ${synthetic.name}/${device}`);
  };

  // shared work queue capped at core count since rendering is cpu-bound
  const concurrency = availableParallelism();
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < mine.length) await run(mine[next++]);
    }),
  );
  await browser.close();
};

const main = async () => {
  await ensureFree(BACKEND_PORT, "SYNTHETICS_BACKEND_PORT");
  await ensureFree(FRONTEND_PORT, "SYNTHETICS_FRONTEND_PORT");

  process.env.VITE_FRONTEND_URL = FRONTEND_URL;
  const built = build({ root: frontendDir, logLevel: "warn" });

  await sql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`, admin);
  await sql(`DROP ROLE IF EXISTS ${DB_NAME}`, admin);
  await sql(`CREATE ROLE ${DB_NAME} LOGIN PASSWORD '${DB_NAME}'`, admin);
  await sql(`CREATE DATABASE ${DB_NAME} OWNER ${DB_NAME}`, admin);

  const timetables = await seed();
  const { rows } = await sql("SELECT id FROM announcement");

  const backend = backendScript("src/index.ts");
  backend.stdout.pipe(process.stdout);
  try {
    await waitForBackend(backend);

    await built;
    const server = await preview({
      root: frontendDir,
      preview: {
        port: FRONTEND_PORT,
        strictPort: true,
        proxy: {
          "/api": {
            target: API,
            rewrite: (path) => path.replace(/^\/api/, ""),
          },
        },
      },
    });
    try {
      await shoot(
        timetables,
        rows.map((r) => r.id),
      );
    } finally {
      await server.close();
    }
  } finally {
    if (backend.pid) process.kill(-backend.pid);
  }
};

await main();
