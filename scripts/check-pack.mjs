import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const releaseUnlocked = process.env.ARMATURE_AI_TRAFFIC_RELEASE_UNLOCKED === "1";
assert.equal(pkg.private, releaseUnlocked ? undefined : true, "private publish guard is in the wrong state");
if (releaseUnlocked) assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(pkg.dependencies, undefined, "runtime dependencies are not allowed in version one");
for (const name of ["preinstall", "install", "postinstall"]) {
  assert.equal(pkg.scripts?.[name], undefined, `${name} scripts are not allowed`);
}
const [packed] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: root,
  encoding: "utf8",
}));
const files = packed.files.map((entry) => entry.path);
assert.ok(files.includes("package.json"));
assert.ok(files.includes("README.md"));
assert.ok(files.includes("LICENSE"));
assert.ok(files.includes("dist/esm/index.js"));
assert.ok(files.includes("dist/cjs/index.js"));
assert.equal(files.some((path) => path.startsWith("src/")), false, "source files must not enter the tarball");
assert.equal(files.some((path) => path.startsWith("tests/")), false, "tests must not enter the tarball");
assert.equal(files.some((path) => path.includes(".env")), false, "environment files must not enter the tarball");
assert.ok(packed.size < 500_000, `packed package is unexpectedly large: ${packed.size} bytes`);
