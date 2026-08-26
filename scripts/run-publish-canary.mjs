import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suppliedArtifact = process.argv[2];
const ownsArtifact = !suppliedArtifact;
const artifact = suppliedArtifact
  ? resolve(suppliedArtifact)
  : resolve(root, JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8" }))[0].filename);
const tempBase = process.env.ARMATURE_AI_TRAFFIC_CANARY_TMPDIR
  || (process.platform === "win32" ? tmpdir() : "/tmp");
const consumer = await mkdtemp(join(tempBase, "armature-ai-traffic-canary-"));
try {
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", artifact], { cwd: consumer, stdio: "inherit" });
  const esm = await import(join(consumer, "node_modules", "@armature-tech", "ai-traffic", "dist", "esm", "index.js"));
  assert.equal(typeof esm.createAiTraffic, "function");
  const requireCheck = execFileSync(process.execPath, ["-e", "const p=require('@armature-tech/ai-traffic'); if(typeof p.createAiTraffic!=='function') process.exit(2)"], {
    cwd: consumer,
    encoding: "utf8",
  });
  assert.equal(requireCheck, "");
  assert.doesNotThrow(() => esm.createAiTraffic({ apiKey: "bad" }).track({ url: "not a url" }));
  const installed = JSON.parse(await readFile(join(consumer, "node_modules", "@armature-tech", "ai-traffic", "package.json"), "utf8"));
  assert.equal(installed.name, "@armature-tech/ai-traffic");
  console.log(`verified ${installed.name}@${installed.version} from ${artifact}`);
} finally {
  await rm(consumer, { recursive: true, force: true });
  if (ownsArtifact) await rm(artifact, { force: true });
}
