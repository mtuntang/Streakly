// Copies the static and public folders into the standalone server's tree.
// The standalone output only carries the server and its trimmed
// node_modules; Next leaves the static chunks and public files outside it.
// Node's fs.cpSync works the same on Windows and Linux, unlike the shell
// "cp -r" this replaced (it fails in cmd.exe, which npm uses as its script
// shell on Windows).
import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const webDir = path.join(import.meta.dirname, "..", "web");
const target = path.join(webDir, ".next", "standalone", "apps", "web");

if (!existsSync(target)) {
  console.error(`No standalone output at ${target}. Run next build first.`);
  process.exit(1);
}

for (const [from, to] of [
  [path.join(webDir, ".next", "static"), path.join(target, ".next", "static")],
  [path.join(webDir, "public"), path.join(target, "public")],
]) {
  cpSync(from, to, { recursive: true });
}
console.log(`Copied static and public into ${target}`);
