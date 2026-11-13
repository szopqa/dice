import { readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dirs = args.length ? args : ["js", "test", "scripts"].map((d) => join(root, d));

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

let failed = false;
for (const file of dirs.flatMap(walk)) {
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) {
    failed = true;
    console.error(`Syntax error in ${file}\n${r.stderr}`);
  }
}
process.exit(failed ? 1 : 0);
