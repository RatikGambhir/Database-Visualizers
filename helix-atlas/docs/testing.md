# Test coverage

Run from `helix-atlas`:

```sh
npm test
npm run test:coverage
npm run build
cargo test --locked --offline --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --locked --offline --all-targets --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Install dependencies with `npm ci` first. Rust's `--offline` flag requires the
locked crates to have been downloaded already; omit it on a fresh machine.
Both test suites bind ephemeral ports on `127.0.0.1` for HTTP integration tests.
They need permission to open loopback sockets and never contact a Cloud gateway.

## Scenario map

| Area | Scenarios | Tests |
| --- | --- | --- |
| Connection session | Strict Mode startup; probe before save; failed probe/persistence; overlapping saves; disconnect during a request; stale startup response | `test/workspaceConnection.test.ts` |
| Query execution | Compile and connection prerequisites; result routing; bounded unique history; old success/error responses; connection error categories; preview versus executed wire | `test/workspaceQueries.test.ts` |
| Background resources | Inspector, schema and graph races; disconnect invalidation; automatic graph load; explicit retry; manual query superseding automatic graph load | `test/workspaceResources.test.ts` |
| Editor compilation | Debounce; browser/blank source; stale source/revision; error; unmount; reset while compilation is pending | `test/queryCompilation.test.ts` |
| App workflows | Browser shell; theme; connect → schema → query → wire; corrected compile errors; transport diagnostics; reconnect and disconnect | `test/app.test.tsx` |
| Connection controls | Local/remote URL and IPv6; invalid ports; optional credentials; Shared Cloud; protocol; advanced options; probe feedback; pending-save dismissal; cancelled drafts | `test/connectionForm.test.ts`, `test/connectionDialog.test.tsx` |
| Editor controls | Ctrl/Cmd+Enter; disabled shortcuts; Tab replacement; accessible source diagnostics and caret jump | `test/queryEditor.test.tsx` |
| Results and inspector | Every result kind; exact large integer and fractional sorting; mixed/missing cells; ID links including zero; empty/zero-count groups; endpoints; incoming/outgoing links; caps | `test/resultsPanel.test.tsx`, `test/inspector.test.tsx` |
| Schema and reference | Initial, disconnected, loading and failed states; search; category changes; visible-card expansion; fields and sampling failures; exact starter queries; mobile reference; history | `test/schemaView.test.*`, `test/sidebar.test.tsx` |
| Graph presentation | Empty/dense selection; deterministic finite positions; immutability; parallel edges, loops and dangling edges; exact IDs; captions; label palette; loading/retry/cap states | `test/flowElements.test.ts`, `test/layout.test.ts`, `test/palette.test.ts`, `test/graphWorkspace.test.tsx` |
| IPC | Stable commands/argument keys; structured errors; malformed metadata; arbitrary failures; browser/desktop detection | `test/client.test.ts` |
| HTTP mock | Real HTTP routes and status codes; malformed/read-only envelopes; exact JSON integer transport; pinned compiler corpus | `test/mockHttp.test.ts`, `test/readCompatibility.test.ts` |
| Rust grammar and compilers | Precedence; comments and quotes; clause order; per-hop filters; aliases; malformed source spans; unsigned/signed boundaries; protocol-specific lowering | `src-tauri/src/hql/**/tests.rs`, compiler facade tests, `compatibility_tests.rs` |
| Rust decoding and schema | Strict return shapes and association; duplicate/conflicting IDs; empty/malformed rows; integer boundaries; graph caps; samples; escaped starter queries | `src-tauri/src/results/*tests.rs`, `src-tauri/src/schema/*tests.rs` |
| Rust connection and persistence | Endpoints; protocol migration; credential isolation; invalid headers; round trip; malformed config; failed save leaves live state intact; Unix file mode | `src-tauri/src/connection/tests.rs`, `state/tests.rs`, `compatibility_tests.rs` |
| Rust HTTP transport | Actual compiled POST body and scoped headers; count decoding; HTTP 401/429/503; malformed successful body; clamped timeout; refused connection; all non-200 status handling | `src-tauri/src/transport/*tests.rs` |

## Coverage gates

`npm run test:coverage` produces a text report, an HTML report at
`coverage/index.html`, and machine-readable `coverage/coverage-summary.json`.
Reports are ignored by Git. The command fails when a configured minimum drops:

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Entire measured source | 75% | 70% | 70% | 75% |
| Application state and workspace modules | 90% | 80% | 85% | 90% |
| Typed IPC client | 95% | 90% | 100% | 100% |
| Connection form state and URL helpers | 100% | 85% | 100% | 100% |

Coverage includes untested application and mock modules. Only the browser entry
point, generic UI primitives, and icon-generation script are excluded. The
JavaScript report does not measure Rust coverage.

## Test conventions

- Keep fixtures small and typed in `test/support/`.
- Hook tests use fake timers and controlled deferred promises to force request
  completion order without relying on timing. They mount the workspace hook in
  Strict Mode. Restore timers and clean up mounted components after each test.
- App tests use the real session hook and UI, with mocked IPC, splash animation,
  and canvas geometry. Import `test/support/workspace` before application modules
  to register its IPC mock before those modules load.
- Loopback HTTP fixtures close connections after each test. Rust configuration
  and HTTP fixtures use `Drop` to clean up even after a failed assertion.
- Assert user-visible behavior and contracts. Add a regression test when a bug
  is found; avoid tests that merely repeat an implementation.

## Remaining gaps

DOM tests do not verify native Tauri IPC registration, webview canvas geometry,
pan/zoom/drag gestures, splash animation timing, OS window behavior, or packaging.
The graph canvas and renderers remain visible as gaps in the coverage report.
Live Cloud authentication/routing and filesystem behavior on other operating
systems need integration checks on their target environments.

The pinned live-server Rust corpus is ignored by default. Run it with an isolated,
seeded instance using the setup in
[verification evidence](../contracts/helixdb-v2/verification.md). The offline
fixture corpus and local HTTP tests run by default; they cannot replace every
live-server or native desktop check.
