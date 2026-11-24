# Demo 3 engineering report

Portfolio exercise using synthetic Stage. The tables below are generated from GitHub Actions job and artifact records, checkout logs, Node test summaries, and the Playwright report.

Backend and safety suites are shown per job as executions. The two jobs run the same suites, so their counts must not be added as unique cases. Skipped workflow steps are shown as not run. Missing counts are shown as unavailable. Browser eventual-pass counts follow the Playwright flaky outcome and do not establish flakiness from reruns alone.

## Run 45440425693 (failure)

[Run](https://github.com/sgyves71/discogs-manager-info/actions/runs/45440425693) | trigger: `pull_request` | created: `2026-11-24T16:43:26Z` UTC | head: `59216b50b90f0745c91f981e2e06e90a4189e0cc` | workflow attempt: 1 | Windows synthetic Stage

| Job | Checkout | Build/type-check | Backend | Safety | Browser | Diagnostics |
| --- | --- | --- | --- | --- | --- | --- |
| Stage demo one (failure) | `309d82b3ffa15c0c489fe8ae770041bd8d0b17b2` | success | success; 40 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo | success; 4 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo | failure; 0 passed, 1 failed, 0 skipped, 0 eventual passes after failure, 1 initial failures, 0 retries | [Artifact](https://github.com/sgyves71/discogs-manager-info/actions/runs/45440425693/artifacts/14942653570) |
| Stage demo two (success) | `309d82b3ffa15c0c489fe8ae770041bd8d0b17b2` | success | success; 40 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo | success; 4 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo | success; 1 passed, 0 failed, 0 skipped, 0 eventual passes after failure, 0 initial failures, 0 retries | [Artifact](https://github.com/sgyves71/discogs-manager-info/actions/runs/45440425693/artifacts/14943975123) |


## Run 45440957230 (success)

[Run](https://github.com/sgyves71/discogs-manager-info/actions/runs/45440957230) | trigger: `pull_request` | created: `2026-11-24T16:46:10Z` UTC | head: `e71396c426c4e99aa7cad4f5d08e333b26352d54` | workflow attempt: 1 | Windows synthetic Stage

| Job | Checkout | Build/type-check | Backend | Safety | Browser | Diagnostics |
| --- | --- | --- | --- | --- | --- | --- |
| Stage demo one (success) | `2c74ab0abd1b38f65f4c5645f400c8f124bbba9b` | success | success; 40 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo | success; 4 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo | success; 1 passed, 0 failed, 0 skipped, 0 eventual passes after failure, 0 initial failures, 0 retries | [Artifact](https://github.com/sgyves71/discogs-manager-info/actions/runs/45440957230/artifacts/14944695166) |
| Stage demo two (success) | `2c74ab0abd1b38f65f4c5645f400c8f124bbba9b` | success | success; 40 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo | success; 4 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo | success; 1 passed, 0 failed, 0 skipped, 0 eventual passes after failure, 0 initial failures, 0 retries | [Artifact](https://github.com/sgyves71/discogs-manager-info/actions/runs/45440957230/artifacts/14943083442) |

## Diagnosis and reproduction

See the [case study](demo-three.md#diagnosis-and-repair) for the affected workflow, expected and actual behavior, evidence, cause, fix, reproduction steps, and limitations. That interpretation is a Codex-assisted draft for human review. The table generation requires no AI service.
