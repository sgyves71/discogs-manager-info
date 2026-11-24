# Demo 1 · Find, add, edit, and reject a duplicate

See the [architecture and request-flow diagrams](architecture.md) for the production and Stage boundaries and the calls made during this walkthrough.

## Reviewer journey

1. In Search & Scan, look up `Stage Mock Artist` and `Mocked CD Album`. Select the original CD and confirm catalog number `MOCK-CD-001`.
2. Choose **Edit & Add**, then **Add to Catalog**. Expect HTTP 201 and the default VG+ condition. Open Catalog and select the saved album.
3. In the detail actions, choose **Edit Catalog Details**. Change the title to `Mocked CD Album (corrected)` and enter a note. Save and verify the revised heading.
4. Search for and add the original release again. Expect HTTP 409 and the dialog text “This exact Discogs release is already in your catalog.” Dismiss it with **OK**.
5. Read the catalog through the API and verify one record with the original local entry ID and Discogs release ID, plus the corrected title and note.

The application matches duplicates by Discogs release ID. Two distinct pressings can have different release IDs even if the artist and title match. A record without a Discogs release ID bypasses that duplicate check. The database schema has no unique constraint on the release ID, so sequential duplicate rejection is covered and concurrent insertion remains unverified.

## Repeatable starting state

Manual walkthrough on November 18, 2026 passed on Stage. Stephen added release 900101, corrected its title, and saw the duplicate dialog on a second add. Separate API reads verified the initial save, the title correction, and exactly one corrected row after the duplicate attempt.

Use the [Stage runbook](../e2e/README.md). Reset while Stage is stopped. The synthetic seed creates releases 900001 and 900002. The Discogs fixture supplies release 900101, which starts absent from the collection. Run the demo separately from suites that count or scan the seed rows. Its teardown deletes the exact entry it created. If a run is interrupted and leaves an entry behind, stop Stage and reset it before the next run.

Unit and service checks cover data interpretation and integration behavior with fixtures. The existing API suite covers required fields, defaults, editing, status codes and deletion. The browser journey exercises the real Stage UI/API path and asserts the saved state via a separate request after the duplicate attempt. A separate read-only SQLite check verified that teardown left only the two seed records.

## Hosted Windows CI evidence (November 23, 2026)

| Run | Verified outcome |
| --- | --- |
| [Passing pull request run](https://github.com/sgyves71/discogs-manager-info/actions/runs/45284156544) | The build and type checks passed, all 40 backend tests and all 4 Stage safety checks passed, and Demo 1 passed with one Chromium worker and zero retries. GitHub uploaded the Playwright report and Stage logs. |
| [Controlled failure after merge](https://github.com/sgyves71/discogs-manager-info/actions/runs/45295006017) | The isolated test branch deliberately expected HTTP 418 for the save. Stage returned HTTP 201, so CI failed at the intended assertion and still uploaded diagnostics. The downloaded artifact contained the HTML report, Playwright trace, and Stage server logs. The job log showed both Stage process trees stopped. |

For the passing run, follow the add, edit, duplicate rejection, and API persistence steps in the report. For the controlled failure, open the failing assertion and compare its expected status with the API response. The failure was confined to a separate test branch. Both runs used synthetic Stage data and confirmed that direct API calls and the frontend proxy reached the same seeded instance before running the browser test. Run links document the result. Artifacts remain available within the workflow's seven-day retention period.

## Verified baseline · November 18, 2026

Reviewed branch `agent/playback-library-solid-refactor` at `49a8aa8`. The IIS page and proxied health endpoint returned 200, as did the direct running API health endpoint. Production checks were limited to those HTTP responses. The development and Stage ports were initially available. No personal UI workflow or previous-release parity was verified.

Used a temporary source copy on Windows with Node 24.18.0, npm 11.16.0, and existing dependencies. The copy excluded ignored environment files, certificates, personal and existing Stage databases, and local media. The run used newly seeded SQLite and loopback HTTP, with Discogs and MusicBrainz fixtures and disabled account credentials.

| Command or check | Result |
| --- | --- |
| `npm run build` | Frontend and backend passed. Vite reported a bundle above its 500 kB warning threshold. |
| `npm run test:unit` | 39 passed. The timeout test intentionally logged mocked errors. |
| Stage safety tests (now `node --test scripts/tests/stage-safety.test.mjs`) | 3 passed, 1 skipped. Covered unsafe effective configuration, hard-linked DB and sidecars, and a redirected Prisma directory. Windows file-symlink permissions prevented the reverse-alias test from running. |
| Stage launcher with synthetic dotenv overrides | Both the personal-style DB URL and a change to production mode were rejected before Prisma startup. The synthetic sentinel remained intact and no Stage DB was created. |
| `npm run stage:reset` and both Stage launch scripts | Synthetic migrations and seed succeeded. Direct API and frontend proxy returned the same process identity and fixture marker. Playwright also rejected the personal API address before running tests. |
| `npm run test:e2e:stage` | First run, zero retries, 34 passed and 7 failed. Passed fixture lookup and selection, navigation, catalog mutation API, infinite-scroll UI with mocked pages, artwork fixture and UI checks, statistics UI with mocked values, and library index checks. |
| Direct Stage API and read-only SQLite checks | Passed catalog search, style filter, artist order, minimum page size, out-of-range page, statistics count, and demo cleanup. Live traversal over multiple full server pages was outside the two-row fixture. |
| `npm run test:e2e:stage -- --demo-one` | 1 passed after correcting the new test's menu locator and teardown. No product changes were needed for the journey. |

### Existing failures

- Artist filtering and simulated sync each expected one seed release. The seed supplies two. The API returned both for the artist filter, and the sync preview reported two eligible releases. The failing sync test stopped before starting the job.
- Mobile cover grid and MusicBrainz detail used a partial button name matching multiple Catalog controls. Their remaining assertions were not reached.
- Menu dismissal and repeated detail save used a retired `summary` selector. The current detail menu has an accessible action button. Their intended assertions remain unverified.
- Playback scan returned three matches when two were expected. The first run had eight workers and a catalog mutation suite active at the same time. Confirm interference in an isolated run before assigning a playback defect. Queue navigation and actual audio playback remain unverified.

Baseline artifacts retained locally include the console log and Playwright HTML output with failure evidence. The focused demo has a separate HTML report. The personal services stayed running. Command policy blocked cleanup of the temporary Stage listeners, so Stage remained running at handoff. CI, deployment, and external account writes were outside the verification run.

## Stage regression follow-up

The organization refactor was verified in a disposable checkout on alternate loopback ports. A clean build contained zero compiled tests. All 39 backend unit tests and the focused Demo 1 browser test passed. The full Stage suite reproduced the same 34 passes and seven failures above with zero retries. A separate Stage sync request completed through the injected fixture client, and a read-only SQLite check confirmed both synthetic results persisted.

The follow-up aligned selectors with the current UI, verified both seed releases, and restored the documented pointer-leave behavior for the catalog detail menu. Playback passed alone from a fresh seed. The full suite passed 41 of 41 on a separate fresh seed with one worker and zero retries. Playwright now defaults to those settings because catalog mutations and catalog-wide scans share the same SQLite file. Live audio playback was outside this fixture check.

The November 18, 2026 production release followed a verified SQLite backup and an authorized backend restart. The initial attempt rolled back after a text comparison changed line endings and reported a false mismatch. The retry succeeded using byte hashes. Independent checks confirmed that IIS served the candidate HTML, JavaScript, and CSS, the installed backend entry matched the candidate, and the production API returned healthy. No database migration was needed.
