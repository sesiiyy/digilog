# Validation record

Date: 2026-11-05. Local macOS / Apple Silicon, Python 3.14.6, Node 24.19.0. All test data is synthetic.

| Check | Result |
|---|---|
| Pytest engine and FastAPI suite | 28 passed |
| Vitest formatting + live backend contract | 3 passed, zero skipped when DIGILOG_API is set |
| TypeScript checks and Vite production build | Passed; separate chart/flow bundles |
| Backend and frontend startup | Passed on 127.0.0.1:8000 / 5173 |
| Combined dev launcher | Passed using local toolchain override |
| Built frontend served by FastAPI | Passed on temporary port 8001; home, health and local docs/assets verified |
| Synthetic dataset CLI | Passed for small preset |
| Database environment override | Passed |
| Script shell syntax | Passed |
| Browser step control | Verified clock 0 → 30 → 60, actual order/stage/queue changes |
| Browser start control | Verified running state and backend ticker; pause tested through API |
| Browser paired comparison | Verified five replications, seed list, means, intervals and resource/bottleneck changes |
| Browser bounded optimization | Verified 12 evaluated configurations and honest no-feasible-candidate outcome at 80% SLA |
| Responsive layout | Visually inspected narrow and 1440px desktop layouts |
| Branding scan | Application source/docs contain no prior project name or company references |
| Docker | Configuration supplied; NOT built or run because Docker is unavailable |
| Native print dialog / physical printing | Not automated; printable CSS/view supplied |

A dependency deprecation warning from the installed Starlette TestClient/httpx adapter is present; it does not fail tests. The tests use the project's documented requirements. Installation requires internet; application runtime has no external data source or telemetry. API docs use locally bundled Swagger UI with remote validation disabled.

## Example observed experiment

Medium baseline (8 workers, 2 picking stations, 2 equipment units, 4 vehicles, 30 orders/hour) versus 3 picking stations + 3 equipment units, 480 minutes, seeds 42–46:

- Mean completed deliveries: 92.6 → 96.6.
- Paired delivery difference: +4.0; 95% CI approximately +0.4 to +7.6.
- Mean operating cost: $1,748.4 → $1,821.4.
- Picking occupancy: 98.1% → 78.5%.
- Downstream fleet pressure remains high; extra picking capacity does not remove every constraint.

These are simulated outcomes for that exact experiment, not promised improvements or real operational evidence. Re-run with more replications and independent seeds before drawing broader conclusions. See ASSUMPTIONS.md for completion bias, SLA denominator, horizon policy and fictional costs.
