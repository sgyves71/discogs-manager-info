# Demo 3: Catalog integrity release gate

## Planned experiment

- Contract: the second create of the same Discogs release returns HTTP 409. The edited original remains the only catalog row. See [Demo 1](demo-one.md).
- Regression: temporarily remove the duplicate guard from the catalog create route on the experiment branch. Leave the update route, fixtures, Stage guards and test assertions intact.
- Gate: the existing Demo 1 Chromium test makes the duplicate request through the UI and checks the API response and subsequent persisted state. It connects a service contract to an observable user workflow. Demo 2 remains independent and acts as a comparison job.
- Scope: sequential creates against synthetic Stage only. The experiment does not demonstrate concurrent uniqueness or production readiness.

## Diagnosis and repair

**Evidence.** On regression commit `59216b50b90f0745c91f981e2e06e90a4189e0cc`, the unchanged Demo 1 test expected `409` and received `201` at the duplicate-save step. The hosted trace records two `POST /api/cds` responses with status `201`. No request payload, local path, or screenshot is copied into this document. The failure screenshot shows the search form reset after the second save. The screenshot provides UI context; the network trace establishes the response. The assertion stopped the test before its subsequent persistence read, so the red run did not independently count the rows. [Hosted failure and diagnostics](https://github.com/sgyves71/discogs-manager-info/actions/runs/45440425693)

**Interpretation (Codex-assisted draft for Stephen's review).** The POST handler reached its normal creation path twice because the regression removed the release-ID lookup and early 409 response. Demo 2 passed on the same run. Stage identity, build, backend tests and safety checks passed first. That pattern and the two actual create responses support an application defect in the intentionally changed handler. A clean rerun alone would not justify a flakiness classification.

**Repair.** Commit `e71396c426c4e99aa7cad4f5d08e333b26352d54` restores the create guard. The catalog route and Demo 1 assertions were compared byte-for-byte through Git against the starting main revision. The test again verifies 409, visible duplicate feedback, and one corrected row. No test retries, new skips, or timing changes were needed.

## Reproduce safely

Use a clean Windows checkout with Node 24.18.0, installed Chromium and free Stage ports 3101/5174. Build, then run `powershell.exe -NoProfile -File scripts/verify-ci-stage.ps1 -Demo one`. The runner verifies the canonical disposable database and direct/proxy Stage identity before browser writes, seeds synthetic fixtures, and stops the servers in its teardown. Run the experiment revisions only in disposable copies without personal environment files, media or credentials.

The test is intentionally cross-layer. Backend and guard checks establish build integrity and safe setup. The browser drives the actual application, then reads the catalog through the API. It covers the sequential duplicate contract. There is no unique constraint proving concurrent guarantees, and the hosted failure was a CI signal without an enforced required check on main. This exercise does not establish production readiness or authorization to deploy.

## Evidence and reports

- [Engineering report](demo-three-engineering.md) records the exact checked-out commits, job outcomes, counts and artifact links.
- [Fictional leadership digest](demo-three-leadership.md) summarizes the signal, correction and next action.
- GitHub produced the original job records, logs and Playwright artifacts. The Markdown reports were generated afterward from retained evidence. Nothing from the raw HTML, trace, screenshot or machine-specific log is committed.
- Regenerate while artifacts are retained using `python scripts/report-demo-three.py <failed-run-id> <passing-run-id> --output <output-folder>` with authenticated GitHub CLI. The script uses GitHub job-step data, exact checkout records, Node's count summary, and the lockfile-pinned Playwright embedded report schema. A missing report yields unavailable counts. Run `python scripts/test-report-demo-three.py` for focused reporting checks. Durable reports preserve the selected evidence after the hosted artifact retention window.
- Codex authored the controlled change, inspected the evidence and drafted the diagnosis. The independently existing test defines the expected behavior. Stephen's review, approval and merge are pending.
