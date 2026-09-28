# Rust application-core porting guide

This document records the current Helix Atlas architecture and the changes
needed to port it to another copy of the project. The important boundary is:

> React sends user intent and renders view models. Rust owns HQL, networking,
> response interpretation, schema discovery, and connection persistence.

There is deliberately no browser implementation of the query pipeline.

## Resulting behavior

- The Explorer-style splash, Query, Schema, and Graph workspaces remain React.
- The editor sends HQL source to Rust for live validation and wire preview.
- Running a query sends source—not an AST or serialized traversal—over IPC.
- Rust lexes, parses, validates, compiles, posts to the selected v1/v2 endpoint, checks the HTTP
  response, decodes its shape, and returns a typed result view model.
- Rust discovers labels, samples properties, infers field metadata, and builds
  the starter queries shown in the schema UI.
- Rust owns URL normalization, timeouts, bearer credentials, writer requirements,
  and persisted connection settings.
- Entity ids and integers outside JavaScript's safe range cross IPC as strings,
  so the webview cannot round an integer.
- The frontend owns only view state, request lifecycle state, selection, theme,
  layout, and rendering.

## File inventory

| File | Responsibility |
|---|---|
| `src-tauri/src/hql.rs` and `hql/` | Public facade; lexer, typed plan, validation; parser grammar stages and versioned statement/selection/predicate lowerers |
| `src-tauri/src/results.rs` and `results/` | JSON parsing, protocol-specific response handling, result normalization, exact integer IPC models |
| `src-tauri/src/schema.rs` | Schema field inference and safe starter-query generation |
| `src-tauri/src/lib.rs` | Tauri startup and command registration |
| `src-tauri/src/commands/`, `connection.rs`, `state.rs`, `transport.rs`, `error.rs` | IPC commands, schema sampling, connection validation, persistence, HTTP execution, structured failures |
| `src/client.ts` | Thin typed wrappers around Tauri `invoke` plus structured error conversion |
| `src/results.ts` | TypeScript result contracts and display-only string formatting |
| `src/schema.ts` | TypeScript schema contracts and display-only filtering/formatting |
| `src/App.tsx` and `src/app/` | Application composition; connection session and stale request guards; workspace presentation, editor compilation, theme |
| `tools/mock-helix-server.mjs` | Strict development stand-in for version-matched v1/v2 read protocols |

The old `src/hql/` TypeScript implementation and frontend response reader are
removed. Do not restore them as fallbacks: two implementations will drift.

## IPC contract

### `compile_query`

Input:

```json
{ "source": "SELECT * FROM NODES LIMIT 25" }
```

Output:

```json
{
  "protocol": "v2",
  "executionKind": "read",
  "endpointPath": "/v2/query",
  "endpoint": "http://127.0.0.1:6969/v2/query",
  "connectionRevision": 0,
  "transportJson": "{ ... }",
  "summary": "all properties of nodes"
}
```

HQL failures are serialized with `kind`, `message`, `span`, and `hint`, allowing
the React editor to select the offending token without parsing anything.

### `run_query`

Input is the same HQL `source`. Output contains:

- `compiled`: the backend-produced wire preview and summary;
- `durationMs`: HTTP duration;
- `result`: a tagged rows/count/groupCount/graph/labels/stats/describe model.

The command recompiles source even if the editor already validated it. Live
validation is a user-experience feature; backend validation remains authoritative.

### `test_connection`

Input is a candidate connection only. Rust constructs and executes the fixed,
schema-independent probe internally. The frontend cannot supply arbitrary probe
JSON.

### `load_schema`

Takes no query input. Rust performs label discovery, property sampling, field
inference, and safe label quoting, then returns the complete schema model.
Per-label sampling failures are attached to that label instead of discarding the
rest of the schema.

### Connection commands

- `get_connection` returns key presence, never the key.
- `set_connection` validates the URL before saving.
- An omitted API key reuses the stored key only for the same effective endpoint,
  database ID, and deployment scope.
- An empty key clears it; a non-empty key replaces it.
- Changing hosts or gateway prefixes cannot forward an old credential.

## Rust HQL pipeline

The Rust module supports these read-only statement families:

- `SELECT`, including projections, `COUNT(*)`, `GROUP BY`, conditions,
  traversal, ordering, distinct, skip, and limit;
- `QUERY` (`GRAPH` remains a compatibility alias), including node/edge caps,
  `VIA`, requested properties, and traversal;
- `SHOW LABELS`, node/edge label variants, and `SHOW STATS`;
- `DESCRIBE NODE` and `DESCRIBE EDGE`.

Legacy v1 compilation retains the Explorer-compatible read envelope:

```json
{
  "request_type": "read",
  "query_name": "helix_visualizer_select",
  "query": {
    "queries": [
      { "Query": { "name": "rows", "steps": [], "condition": null } }
    ],
    "returns": ["rows"]
  },
  "parameters": {}
}
```

v2 compilation independently lowers the typed plan into
`request_type: "read"` / `query.read.entries` / `query.read.returns`, with nested
operation trees. Source and predicate shapes are pinned in
[the contract directory](contracts/helixdb-v2/README.md). Selection bindings use
`inject` to preserve order and duplicates across exact ID, label, property, and
endpoint projections. Multi-key sorting uses one `order_by_multiple` operation.

Unsupported operations fail before HTTP with a span and hint. Integer token text
remains exact: properties use signed `i64`, v2 entity source references use `u64`
including zero, and legacy references are limited to `i64::MAX`. v2 `DESCRIBE` and
standalone initial ID equality/membership support the unsigned range. The pinned
server clamps virtual-ID expressions above the signed range; unsupported large
ID comparisons and all virtual-ID ordering/grouping are rejected locally.

## Response and schema rules

The legacy decoder accepts named results, `data`/`result`/`results` wrappers, bare
single-variable arrays, and Explorer `properties` envelopes. It:

- normalizes `$id`, `$label`, `$from`, and `$to` for display;
- prevents stored `id`/`label` properties from shadowing entity identity;
- deduplicates graph entities and excludes dangling edges;
- records truncation and dangling-edge counts;
- supports scalar, object, map, and sampled-row count shapes;
- separates entity properties, identity, relationships, and endpoints;
- converts out-of-range integer properties to exact decimal strings before IPC.

The v2 adapter requires every declared return, validates row and projection
shapes, and requires matching projection lengths from a materialized binding.
It overlays exact IDs from raw `id` terminals, never clamped property IDs.
Malformed identities, endpoints, and grouped counts fail instead of disappearing.
Legacy star projections join by verified ID rather than position. Schema samples
retain integer classification and convert large integers before IPC.

Schema labels include backend-generated `browseQuery` and `graphQuery` strings,
so React never needs to quote identifiers or assemble HQL.

## Connection and security behavior

- Base origins, gateway prefixes, and version-matched complete query URLs work;
  explicit endpoint/version mismatches fail before HTTP.
- Scheme-less values default to HTTP; only HTTP and HTTPS are accepted.
- Old saved connections without a protocol deserialize as legacy v1; new ones
  default to v2. Protocol selection is explicit, with no HTTP fallback.
- Local/direct, database-specific Cloud, and shared Cloud deployment scopes are
  explicit. Only shared Cloud v2 accepts and sends `X-Helix-Database-Id`.
- Each request snapshots connection state before compilation, reuses it for
  decoding, and holds no connection lock across network awaits. Schema samples
  share one snapshot. Frontend generations discard stale connection results.
- Writer requirement is optional and does not promise routing. Reads never send
  await-durable or cache-warming headers. Structured errors retain status/code/msg.
- Timeouts are clamped to 1–600 seconds.
- API keys are added only as bearer headers and never returned through IPC.
- The config file is narrowed to mode `0600` on Unix.
- The Tauri transport is not subject to browser CORS restrictions.
- `npm run dev` is for rendering/styling only; use `npm run app` for functional
  query and connection development.

## Verification

Run all of the following after porting:

```bash
npm test
npm run typecheck
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

For a runtime smoke test:

```bash
npm run mock
npm run app
```

Connect to `http://127.0.0.1:6969` in both v2 and legacy v1, then verify:

1. `SELECT * FROM NODES LIMIT 5` returns a table.
2. `QUERY LIMIT 25 EDGE LIMIT 90` renders a graph.
3. Schema refresh returns labels and sampled fields.
4. Selecting a node and edge loads the Inspector.
5. The Wire format tab matches the JSON compiled by Rust.

## Porting checklist

- [ ] Copy the Rust modules and their subdirectories and register them from `lib.rs`.
- [ ] Replace serialized-query commands with source-in/result-out commands.
- [ ] Preserve the connection credential and endpoint protections.
- [ ] Replace `src/client.ts` with typed IPC wrappers.
- [ ] Remove the TypeScript HQL/compiler/result-reader implementation.
- [ ] Consume schema-provided starter queries instead of assembling HQL in UI.
- [ ] Move language/decoder/schema tests to Rust.
- [ ] Remove the frontend Helix SDK dependency.
- [ ] Preserve strict endpoint/envelope dispatch and replay captured fixtures in the mock.
- [ ] Run every verification command above.

The pinned real-server corpus and desktop outcomes are recorded in
[verification.md](contracts/helixdb-v2/verification.md). Cloud gateway behavior,
a real upstream legacy server, and actual high-ID upstream entities remain
separate conformance gaps; a probe or mock cannot prove them.
