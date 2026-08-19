/*
  Turns the raw hero screenshot into the asset the site actually ships.

  The workflow is: capture the app, save it over public/hero-app.png, build.
  This step does the rest, so nobody has to remember to resize or convert by
  hand — and so a fresh 3 MB screenshot can never quietly become the largest
  thing on the landing page.

  The source PNG is deliberately gitignored; only the generated .webp is
  committed. A 440 kB screenshot and its 74 kB derivative in the same repo is
  435 kB nobody ever downloads.
*/
import { existsSync, statSync, mkdirSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/*
  Capture to public/hero-app.png; this moves it here afterwards. Vite copies
  public/ verbatim, so a source screenshot left there gets deployed — 440 kB
  sitting next to the 74 kB derivative that is the only one anything requests.
*/
const dropbox = resolve(root, "public/hero-app.png");
const source = resolve(root, "screenshots/hero-app.png");
const output = resolve(root, "public/hero-app.webp");

if (existsSync(dropbox)) {
  mkdirSync(dirname(source), { recursive: true });
  renameSync(dropbox, source);
  console.log("hero: moved public/hero-app.png → screenshots/hero-app.png");
}

/*
  The hero renders inside max-w-6xl (1152 CSS px), so 2x covers every display
  worth serving. Beyond that is bytes no screen can use.
*/
const TARGET_WIDTH = 2304;

if (!existsSync(source)) {
  // Normal: the committed .webp is all CI needs. Only whoever retakes the
  // screenshot has the PNG locally.
  console.log("hero: no public/hero-app.png — keeping the committed .webp");
  process.exit(0);
}

// Skip when the .webp is already newer than the screenshot it came from.
if (existsSync(output) && statSync(output).mtimeMs >= statSync(source).mtimeMs) {
  console.log("hero: .webp is up to date");
  process.exit(0);
}

const { default: sharp } = await import("sharp");

const info = await sharp(source)
  .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
  // 86 is where this screenshot stops being distinguishable from the PNG at
  // 1:1 — text stays crisp and the dark gradients do not band.
  .webp({ quality: 86 })
  .toFile(output);

const sourceKb = statSync(source).size / 1024;
console.log(
  `hero: ${Math.round(sourceKb)} kB png → ${Math.round(info.size / 1024)} kB webp at ${info.width}px`,
);
