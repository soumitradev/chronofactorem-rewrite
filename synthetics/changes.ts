import sharp from "sharp";

export type Change = {
  width: number;
  height: number;
  pixels: number;
  before: Int32Array;
  after: Int32Array;
};

// patches smaller than this (e.g. antialiased edges) are treated as noise
export const TINY = 10;

const pixelsOf = async (png: Buffer) => {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = new Int32Array(info.width * info.height);
  for (let i = 0; i < px.length; i++) {
    px[i] = (data[i * 3] << 16) | (data[i * 3 + 1] << 8) | data[i * 3 + 2];
  }
  return { px, width: info.width, height: info.height };
};

// changed pixels up to two cells apart are one change
const CELL = 8;
const REACH = 2;

export const changesBetween = async (
  beforePng: Buffer,
  afterPng: Buffer,
): Promise<Change[]> => {
  const [before, after] = await Promise.all(
    [beforePng, afterPng].map(pixelsOf),
  );
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const pixelAt = (image: typeof before, x: number, y: number) =>
    x < image.width && y < image.height ? image.px[y * image.width + x] : -1;

  const columns = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const changed = new Uint8Array(width * height);
  const cells = new Int32Array(columns * rows);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixelAt(before, x, y) === pixelAt(after, x, y)) continue;
      changed[y * width + x] = 1;
      cells[Math.floor(y / CELL) * columns + Math.floor(x / CELL)] = -1;
    }
  }

  let groups = 0;
  for (let start = 0; start < cells.length; start++) {
    if (cells[start] !== -1) continue;
    const group = ++groups;
    cells[start] = group;
    const stack = [start];
    while (stack.length) {
      const cell = stack.pop();
      if (cell === undefined) break;
      const cx = cell % columns;
      const cy = (cell - cx) / columns;
      const minY = Math.max(0, cy - REACH);
      const maxY = Math.min(rows - 1, cy + REACH);
      const minX = Math.max(0, cx - REACH);
      const maxX = Math.min(columns - 1, cx + REACH);
      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const next = ny * columns + nx;
          if (cells[next] !== -1) continue;
          cells[next] = group;
          stack.push(next);
        }
      }
    }
  }

  const boxes = Array.from({ length: groups }, () => ({
    x0: width,
    y0: height,
    x1: -1,
    y1: -1,
    pixels: 0,
  }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!changed[y * width + x]) continue;
      const box =
        boxes[cells[Math.floor(y / CELL) * columns + Math.floor(x / CELL)] - 1];
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
      box.pixels++;
    }
  }
  return boxes.map(({ x0, y0, x1, y1, pixels }) => {
    const boxWidth = x1 - x0 + 1;
    const boxHeight = y1 - y0 + 1;
    const crop = (image: typeof before) => {
      const out = new Int32Array(boxWidth * boxHeight);
      for (let y = 0; y < boxHeight; y++) {
        for (let x = 0; x < boxWidth; x++) {
          out[y * boxWidth + x] = pixelAt(image, x0 + x, y0 + y);
        }
      }
      return out;
    };
    return {
      width: boxWidth,
      height: boxHeight,
      pixels,
      before: crop(before),
      after: crop(after),
    };
  });
};

const SIZE_SLACK = 2;
const ALIKE = 0.9;
const alike = (first: Change, second: Change) => {
  if (
    Math.abs(first.width - second.width) > SIZE_SLACK ||
    Math.abs(first.height - second.height) > SIZE_SLACK
  ) {
    return false;
  }
  const width = Math.min(first.width, second.width);
  const height = Math.min(first.height, second.height);
  // align at either edge since adjacent text changes can shift a patch
  for (const [firstX, secondX] of [
    [0, 0],
    [first.width - width, second.width - width],
  ]) {
    let same = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const firstIndex = y * first.width + firstX + x;
        const secondIndex = y * second.width + secondX + x;
        if (first.before[firstIndex] === second.before[secondIndex]) same++;
        if (first.after[firstIndex] === second.after[secondIndex]) same++;
      }
    }
    if (same >= ALIKE * 2 * width * height) return true;
  }
  return false;
};

export const groupRepeats = <T>(
  screenshots: { item: T; changes: Change[] }[],
) => {
  const tiny = screenshots.filter(({ changes }) =>
    changes.every((change) => change.pixels < TINY),
  );
  let left = screenshots
    .filter((screenshot) => !tiny.includes(screenshot))
    .map(({ item, changes }) => ({
      item,
      changes: changes.filter((change) => change.pixels >= TINY),
    }));
  const shown: { item: T; changes: Change[] }[] = [];
  const unseen = (change: Change) =>
    !shown.some(({ changes }) => changes.some((seen) => alike(change, seen)));
  // greedy set cover over non-tiny changes; earlier shots win ties
  for (;;) {
    const counts = left.map(({ changes }) => changes.filter(unseen).length);
    const most = Math.max(0, ...counts);
    if (!most) break;
    const best = counts.indexOf(most);
    shown.push(left[best]);
    left = left.filter((_, i) => i !== best);
  }
  const repeats = left.map(({ item, changes }) => {
    const shared = shown.map(
      (screenshot) =>
        changes.filter((change) =>
          screenshot.changes.some((seen) => alike(change, seen)),
        ).length,
    );
    return { item, of: shown[shared.indexOf(Math.max(...shared))].item };
  });
  return {
    shown: shown.map(({ item }) => item),
    repeats,
    tiny: tiny.map(({ item }) => item),
  };
};
