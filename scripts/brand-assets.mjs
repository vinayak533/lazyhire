/**
 * Rebuilds the transparent LazyHire brand lockup used by the authentication page
 * from the original banner render in data/image.
 *
 * The source renders carry a baked-in navy banner background that is lighter than
 * the LazyHire page background, so placing them on a page shows a rectangular
 * plate. This script keeps the logo, wordmark, slogan and their glows and turns
 * the baked-in backdrop into real transparency, so the artwork sits directly on
 * whatever background the page paints.
 *
 * Run with: npm run brand:assets
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageDir = path.join(root, "data", "image");

/** Luminance below `floor` is treated as backdrop, above `ceiling` as artwork. */
function alphaRamp(luminance, floor, ceiling) {
  if (luminance <= floor) return 0;
  if (luminance >= ceiling) return 1;
  const t = (luminance - floor) / (ceiling - floor);
  return t * t * (3 - 2 * t);
}

/**
 * Backdrop pixels are dark *and* reachable from the border. Dark pixels enclosed
 * by artwork (the sleeping figure's suit, the counter-shading inside the 3D
 * letters) stay opaque so the lockup does not develop holes.
 */
function reachableBackdrop(alpha, width, height, threshold) {
  const backdrop = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (index) => {
    if (backdrop[index] || alpha[index] > threshold) return;
    backdrop[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }
  return backdrop;
}

/** Fades the outer band to zero so no straight cut line survives the crop. */
function edgeFeather(x, y, width, height, feather) {
  const distance = Math.min(x, y, width - 1 - x, height - 1 - y);
  if (distance >= feather) return 1;
  const t = distance / feather;
  return t * t * (3 - 2 * t);
}

async function build({ source, output, extract, floor, ceiling, feather }) {
  const pipeline = sharp(path.join(imageDir, source));
  const cropped = extract ? pipeline.extract(extract) : pipeline;
  const { data, info } = await cropped
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixels = width * height;

  const alpha = new Float32Array(pixels);
  for (let index = 0; index < pixels; index++) {
    const offset = index * channels;
    const luminance = Math.max(
      data[offset],
      data[offset + 1],
      data[offset + 2],
    );
    alpha[index] = alphaRamp(luminance, floor, ceiling);
  }

  const backdrop = reachableBackdrop(alpha, width, height, 0.55);
  const out = Buffer.alloc(pixels * 4);
  for (let index = 0; index < pixels; index++) {
    const offset = index * channels;
    const x = index % width;
    const y = (index - x) / width;
    const kept = backdrop[index] ? alpha[index] : 1;
    const faded = kept * edgeFeather(x, y, width, height, feather);
    const target = index * 4;
    out[target] = data[offset];
    out[target + 1] = data[offset + 1];
    out[target + 2] = data[offset + 2];
    out[target + 3] = Math.round(Math.max(0, Math.min(1, faded)) * 255);
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(path.join(imageDir, output));
  return { width, height, output };
}

const lockup = await build({
  source: "login-page .png",
  output: "lazyhire-lockup.png",
  // Keeps the mark, wordmark, slogan and floor reflection; drops the decorative
  // banner swooshes that were the visible edges of the rectangle.
  extract: { left: 262, top: 118, width: 1498, height: 505 },
  floor: 46,
  ceiling: 118,
  feather: 46,
});

console.log(
  `Wrote data/image/${lockup.output} (${lockup.width}x${lockup.height})`,
);
