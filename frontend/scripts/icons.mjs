/*
  Renders the whole icon set from public/icon.svg.

  The PNGs used to be hand-made and checked in with no record of how, which is
  why the favicon and the in-app mark were allowed to drift apart: nothing tied
  them to a single source, so changing one meant remembering to redo five
  others in an image editor.

  Not part of `npm run build` — icons change roughly never, and a native
  dependency has no business in the deploy path. Run it by hand when the mark
  changes:

      npm run icons

  Maskable is not the same image at a smaller size. Android crops the icon to
  whatever shape the launcher uses, and only the middle 80% of the canvas is
  guaranteed to survive, so those two get the glyph shrunk into that safe zone
  and the brand colour bled to the edges — a rounded square inside a circular
  mask would otherwise come back with its corners sliced off.
*/

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const source = await readFile(join(publicDir, "icon.svg"), "utf8");

/** The gradient's midpoint — the flat colour behind a maskable icon. */
const BRAND = "#7e6ef2";

/**
 * The mark on its own transparent canvas, at `size`, optionally inset into the
 * middle `1 - 2 * inset` of the frame.
 */
function render(size, { inset = 0 } = {}) {
  const box = Math.round(size * (1 - inset * 2));
  return sharp(Buffer.from(source), { density: 384 })
    .resize(box, box)
    .png({ compressionLevel: 9 });
}

async function square(size, out) {
  await render(size).toFile(join(publicDir, out));
  return out;
}

/** Full-bleed brand background, glyph inside the 80% safe zone. */
async function maskable(size, out) {
  const inset = 0.1;
  const glyph = await sharp(Buffer.from(source), { density: 384 })
    .resize(Math.round(size * (1 - inset * 2)), Math.round(size * (1 - inset * 2)))
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND,
    },
  })
    .composite([{ input: glyph, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, out));
  return out;
}

/*
  iOS ignores transparency and rounds the corners itself, so an icon with its
  own rounded corners comes out with a pale halo where the two radii disagree.
  This one is the glyph on a solid brand square, corners left to the OS.
*/
async function appleTouch(size, out) {
  const glyph = await sharp(Buffer.from(source), { density: 384 })
    .resize(Math.round(size * 0.82), Math.round(size * 0.82))
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND },
  })
    .composite([{ input: glyph, gravity: "center" }])
    .flatten({ background: BRAND })
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, out));
  return out;
}

const written = await Promise.all([
  square(32, "favicon-32.png"),
  square(192, "icon-192.png"),
  square(512, "icon-512.png"),
  maskable(192, "icon-maskable-192.png"),
  maskable(512, "icon-maskable-512.png"),
  appleTouch(180, "apple-touch-icon.png"),
]);

for (const name of written) console.log(`icons: ${name}`);
