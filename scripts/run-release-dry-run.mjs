import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempBase = process.env.ARMATURE_AI_TRAFFIC_CANARY_TMPDIR
  || (process.platform === "win32" ? tmpdir() : "/tmp");
const candidate = await mkdtemp(resolve(tempBase, "armature-ai-traffic-release-"));

try {
  for (const entry of ["dist", "docs", "examples", "scripts", "README.md", "LICENSE", "NOTICE", "package.json"]) {
    await cp(resolve(root, entry), resolve(candidate, entry), { recursive: true });
  }
  const packagePath = resolve(candidate, "package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));
  pkg.version = "0.0.0-release-canary";
  delete pkg.private;
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  const env = { ...process.env, ARMATURE_AI_TRAFFIC_RELEASE_UNLOCKED: "1" };
  execFileSync(process.execPath, [resolve(candidate, "scripts/check-pack.mjs")], {
    cwd: candidate,
    env,
    stdio: "inherit",
  });
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts"], {
    cwd: candidate,
    env,
    encoding: "utf8",
  }));
  execFileSync(process.execPath, [resolve(root, "scripts/run-publish-canary.mjs"), resolve(candidate, packed.filename)], {
    cwd: root,
    env,
    stdio: "inherit",
  });
} finally {
  await rm(candidate, { recursive: true, force: true });
}
