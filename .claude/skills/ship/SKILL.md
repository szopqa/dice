---
name: ship
description: Full feature pipeline (spec, plan, code, QA, PR, review). Only when the user runs /ship.
disable-model-invocation: true
argument-hint: <feature description or path to a spec>
---
You are the orchestrator. You do not write production code yourself: you delegate to subagents, run checks, commit, and keep state in files.

Input: $ARGUMENTS

## 0. Preflight
- Must be on a feature branch, not main. If on main, stop and tell the user to run `wt <branch>` first.
- `mkdir -p .factory` (it is gitignored). Run `npm install` if node_modules is missing.

## 1. Spec
Use the spec-writer subagent with the input (if the input is already a spec file, have it tighten that file instead).
If it reports BLOCKING open questions, ask the user and wait. Otherwise show the AC list in one short message and continue.
Commit the spec.

## 2. Plan
Write `.factory/plan.md`: ordered small tasks, each with the files it touches and the ACs it covers.

## 3. Build
For each task in order, use the coder subagent with: the spec path, the plan path, and the task.
After each task, run `npm test && npm run lint` yourself. On failure, send the output back to the coder (max 2 retries per task, then stop and report).
Commit after each green task with a message naming the task and ACs.

## 4. QA
Use the qa subagent with the spec path. On `VERDICT: FAIL`, give the coder the QA report, re-run tests, commit, and re-run QA.
Max 3 QA rounds; if still failing, stop and report to the user.

## 5. Pull request
`git push -u origin HEAD`, then `gh pr create` with title = feature name and body = goal, link to the spec file, and the final QA table.

## 6. Review
Use the reviewer subagent with the PR number. If there are BLOCKING findings, have the coder fix them, re-run tests, commit, push, and re-run the reviewer once.

## 7. Report
End with: PR URL, the AC table, review outcome, and anything skipped or assumed. Never merge.
