// Vendor the @aztec/bb.js prebuilt browser bundle into public/vendor/bb/.
//
// bb.js ships its browser build as a self-contained, prebuilt webpack bundle
// that Next's own webpack cannot re-bundle (it throws "Object.defineProperty
// called on non-object" at load). We therefore serve it as a same-origin native
// ES module and import it with webpackIgnore (see lib/proof/auction-proofs.ts).
//
// public/vendor/ is gitignored, so this runs on postinstall to keep a fresh
// clone working: `npm install` repopulates it. It is also exposed as
// `npm run vendor:bb`. Cross-platform (pure Node fs), and never fails install.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@aztec", "bb.js", "dest", "browser");
const dest = join(root, "public", "vendor", "bb");

try {
  if (!existsSync(src)) {
    console.warn(`[vendor:bb] source not found at ${src} — run "npm install" first. Skipping.`);
    process.exit(0);
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  const files = readdirSync(dest).filter((f) => f.endsWith(".js"));
  console.log(`[vendor:bb] vendored ${files.length} bb.js browser files into public/vendor/bb/`);
} catch (error) {
  // A failed vendor must not break `npm install`; proving simply won't work
  // until it is re-run. Surface the reason and exit cleanly.
  console.warn(`[vendor:bb] could not vendor bb.js: ${error instanceof Error ? error.message : error}`);
  process.exit(0);
}
