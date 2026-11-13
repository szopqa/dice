import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const yml = readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");

test("AC-22: triggers on push to main and workflow_dispatch", () => {
  assert.match(yml, /on:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(yml, /^\s+workflow_dispatch:/m);
});

test("AC-22: sets required permissions", () => {
  assert.match(yml, /permissions:[\s\S]*contents: read/);
  assert.match(yml, /pages: write/);
  assert.match(yml, /id-token: write/);
});

test("AC-22: runs npm test and uploads repo root", () => {
  assert.match(yml, /run: npm test/);
  assert.match(yml, /uses: actions\/upload-pages-artifact@v3\s*\n\s+with:\s*\n\s+path: \.\s*$/m);
});

test("AC-22: deploys with deploy-pages to github-pages environment", () => {
  assert.match(yml, /uses: actions\/deploy-pages@v4/);
  assert.match(yml, /environment:\s*\n\s+name: github-pages/);
  assert.match(yml, /group: "pages"/);
});
