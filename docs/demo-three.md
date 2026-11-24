# Demo 3: Catalog integrity release gate

## Planned experiment

- Contract: the second create of the same Discogs release returns HTTP 409. The edited original remains the only catalog row. See [Demo 1](demo-one.md).
- Regression: temporarily remove the duplicate guard from the catalog create route on the experiment branch. Leave the update route, fixtures, Stage guards and test assertions intact.
- Gate: the existing Demo 1 Chromium test makes the duplicate request through the UI and checks the API response and subsequent persisted state. It connects a service contract to an observable user workflow. Demo 2 remains independent and acts as a comparison job.
- Scope: sequential creates against synthetic Stage only. The experiment does not demonstrate concurrent uniqueness or production readiness.
