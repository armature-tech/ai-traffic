import { readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
for (const path of ["../dist/esm/core.js", "../dist/cjs/core.js"]) {
  const url = new URL(path, import.meta.url);
  const source = await readFile(url, "utf8");
  await writeFile(url, source.replaceAll('0.0.0-development', pkg.version));
}
