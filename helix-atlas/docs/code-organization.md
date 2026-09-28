# Code organization

Modules follow the responsibility they own. Keep feature helpers beside their
callers; split a file when it combines distinct responsibilities, rather than
when it crosses a fixed line count.

## Rust backend

| Owner | Responsibility |
| --- | --- |
| `src-tauri/src/lib.rs` | Tauri startup, state registration, command registration |
| `connection.rs`, `connection/tests.rs` | Connection contracts, URL validation, credential reuse |
| `state.rs` | Connection snapshots, updates, configuration persistence |
| `error.rs` | Stable structured errors sent over IPC |
| `transport.rs` | HTTP headers, timeouts, status handling, query execution |
| `commands/` | Thin query and connection commands; schema discovery and bounded sampling |
| `schema.rs` | Pure field inference and safe starter-query generation |
| `hql.rs`, `hql/plan.rs`, `hql/validation.rs` | Compiler facade, typed query plan, language validation |
| `hql/lexer.rs`, `hql/parser/` | Tokenization; statement, clause, and expression grammar |
| `hql/legacy/`, `hql/v2/` | Separate statement, selection, and predicate lowering for each wire format |
| `results.rs`, `results/` | Decoder dispatch; view models, response adaptation, rows, counts, graphs, descriptions, exact JSON integers |

Rust child modules expose helpers only within their owning feature. Existing
public connection and execution types remain available through the crate root.
Tauri command names and serialized contracts stay stable across file moves.
The tests live beside the relevant feature, including recorded server fixtures.

## React frontend

| Owner | Responsibility |
| --- | --- |
| `src/App.tsx` | Splash screen and composition of toolbar and workspaces |
| `src/app/useWorkspace.ts` | Connection session, query actions, resource state, stale request guards |
| `src/app/useQueryCompilation.ts` | Debounced Rust editor validation and cleanup |
| `src/app/useTheme.ts` | Theme preference and document synchronization |
| `src/app/QueryWorkspace.tsx`, `GraphWorkspace.tsx`, `InspectorPane.tsx` | Workspace presentation |
| `src/ui/ConnectionBar.tsx`, `src/ui/connection/` | Navigation; dialog, draft settings, validation, URL helpers, icons |
| `src/client.ts` | Typed IPC calls and error conversion |
| `src/graph/GraphCanvas.tsx`, `src/graph/flow/` | React Flow interaction, element construction, custom node and edge rendering |
| `src/graph/layout.ts`, `quadtree.ts`, `palette.ts` | Force simulation, spatial repulsion index, label colors |
| `src/styles.css`, `src/styles/` | Ordered stylesheet entry point and feature rules |

`useWorkspace` keeps connection generation and resource invalidation together:
a save or disconnect invalidates pending query, inspector, schema, and graph
requests. Keep that reset coordinated when adding a new resource. GraphCanvas
remains loaded lazily, and Rust remains the owner of parsing and transport.

CSS imports deliberately retain the original cascade order. Keep shell and
workspace overrides after their base rules, with responsive overrides last.
`redesign.css` remains a separate, later stylesheet imported by `main.tsx`.

## Development mock

`tools/mock-helix-server.mjs` is the public server/CLI entry point. Its existing
exports are preserved for tests. `tools/mock/` owns the deterministic sample
graph, exact JSON integer handling, shared value helpers, operation-tree
predicates, and separate legacy/v2 evaluators.

## Verification

Run from `helix-atlas`:

```sh
npm test
npm run test:coverage
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --offline --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --offline --all-targets --manifest-path src-tauri/Cargo.toml -- -D warnings
```

The live pinned-server test is ignored by default. Its setup is documented in
`contracts/helixdb-v2/verification.md`.
See [the test coverage guide](testing.md) for scenarios and coverage gates.
