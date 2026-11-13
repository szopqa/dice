import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lint = new URL("../scripts/lint.js", import.meta.url).pathname;

function runLint(dir) {
  return spawnSync(process.execPath, [lint, dir], { encoding: "utf8" });
}

test("AC-20: npm test runs node --test with no dependencies", () => {
  assert.equal(pkg.scripts.test, "node --test");
  for (const k of ["dependencies", "devDependencies"]) {
    assert.ok(!(k in pkg) || Object.keys(pkg[k]).length === 0);
  }
});

test("AC-21: lint exits non-zero and names file on syntax error", () => {
  const dir = mkdtempSync(join(tmpdir(), "lint-"));
  try {
    writeFileSync(join(dir, "broken.js"), "const = ;\n");
    const r = runLint(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /broken\.js/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-21: lint exits 0 on valid files", () => {
  const dir = mkdtempSync(join(tmpdir(), "lint-"));
  try {
    writeFileSync(join(dir, "ok.js"), "export const a = 1;\n");
    assert.equal(runLint(dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
