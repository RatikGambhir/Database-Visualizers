# HelixSQL reads: HTTP API compatibility plan

Status: implemented for the pinned v2 contract, with explicit legacy support and
the conformance limits below. Mutation functionality remains disabled.
Research date: 2026-09-28.

## Implementation outcome — 2026-09-28

The versioned compilers, connection migration/settings, endpoint/header rules,
strict result adaptation, immutable request snapshots, schema/inspector/graph
integration, stale UI response guards, and strict mock are implemented. The
compiler was split after the read pipeline worked: `hql.rs` is a 74-line facade,
with focused modules under `hql/`, each below 1000 lines.

Evidence is pinned in [contracts/helixdb-v2](../contracts/helixdb-v2/README.md):
official commit `64eaaca3026446fb08d1a5331215decc9fe0725b`, OpenAPI `2.0.0`, 41 real
operation fixtures, and 33 compiled HelixSQL request/response/result captures.
See [verification](../contracts/helixdb-v2/verification.md) for checks and desktop
smoke outcomes. Sections below retain the original rationale and acceptance scope;
their descriptions of pre-migration code are historical.

The pinned server cannot express every full-range virtual-ID operation: it has
no unsigned predicate constant and clamps virtual-ID expressions/projections
above `i64::MAX`. Exact unsigned `DESCRIBE` and standalone initial ID equality/
membership use source references. General high-ID comparisons and virtual-ID
ordering/grouping fail locally with a span and hint. A grouping property named
`count` also conflicts with this server's output shape and is rejected.

Actual upstream high-ID entity creation/readback, a matching real legacy server,
and Cloud gateways remain unverified. Exact raw ID decoding and IPC boundaries
are covered by synthetic fixtures; high unsigned source lookup is accepted by
the real server for absent entities. These limits do not enable mutations or
claim parity with untested server builds.

## 1. Recommendation and scope

Add a documented v2 read adapter while retaining an explicit legacy v1 read
adapter. Preserve the existing `SELECT`, `QUERY`, `SHOW`, and `DESCRIBE` syntax.
Migrate the entire read pipeline, including connection tests, schema discovery,
automatic graph loading, and inspector queries, rather than changing only the
editor's endpoint.

This plan can ship independently of
[the mutation language plan](helixsql-mutation-language.md). Its acceptance gates
are prerequisites for enabling that plan's v2 mutations: inserted entities must
be readable through the same connection, with exact IDs. Implementing v2 reads
does not establish v1 write support or enable mutation syntax.

## 2. Evidence and current failure points

The public HTTP contract describes `POST /v2/query`, a matching
`request_type: "read"` / `query.read` envelope, and named `entries` containing
operation trees. Success results are keyed by declared return names. Requiring
a writer rejects execution on a non-writer; it is separate from waiting for
durable writes, which is invalid on reads.
[Source: HelixDB HTTP API](https://docs.helix-db.com/database/helix-db/query-guides/http-api).

The operation-tree guide shows each successive operation wrapping its input,
typed predicate constants, unsigned 64-bit entity IDs, and terminal-dependent
response shapes. An empty result with at-most-one cardinality can be `null`,
while a collection can be `[]`.
[Source: HelixDB build and run a query](https://docs.helix-db.com/database/helix-db/core-concepts/overview).

These sources establish a documented v2 target, not that every existing v1
deployment is broken. Keep compatibility claims tied to the tested server build.
During the original planning pass only the HTML guides were available.
Implementation subsequently retrieved and pinned the canonical OpenAPI document,
matching AST/interpreter source, and isolated real-server captures above.

| Location | Current behavior | Required change |
| --- | --- | --- |
| [`src-tauri/src/hql.rs`](../src-tauri/src/hql.rs), `compile_statement` / `named` | Emits `query.queries`, capitalized `Query`, and flat `steps` | Separate logical read planning from version-specific serialization |
| Same file, `predicate` / `selection_steps` | Emits flat predicate operands and traversal operations | Lower expressions, sources, wrappers, and terminals to the pinned v2 types |
| [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) | Appends `/v1/query`; every command compiles without protocol context | Resolve one protocol and endpoint for each request |
| Same file, `Connection` / `ConnectionUpdate` / `ConnectionView` | No protocol or gateway database selection | Add persisted mode and safe migration of saved settings |
| [`src-tauri/src/results.rs`](../src-tauri/src/results.rs) | Accepts several legacy envelopes and merges star-selection identity positionally | Decode each protocol deliberately; preserve row-to-identity association |
| [`src-tauri/src/schema.rs`](../src-tauri/src/schema.rs) | Generates read source for bounded field samples | Route all generated reads through the selected adapter |
| [`src/client.ts`](../src/client.ts), [`src/App.tsx`](../src/App.tsx), [`src/ui/ConnectionBar.tsx`](../src/ui/ConnectionBar.tsx) | Preview and settings omit protocol; wire inspector labels `/v1/query` | Display the selected protocol and actual execution endpoint |
| [`tools/mock-helix-server.mjs`](../tools/mock-helix-server.mjs) | Both paths accepted; presence of `request_type` selects the flat parser | Validate endpoint and envelope together and reject cross-version requests |

The mock's existing nested evaluator is useful implementation material, but it
does not prove conformance: a correctly enveloped v2 read currently enters
`runFlatBatch`, and a flat read can pass at `/v2/query`.

## 3. Connection and endpoint policy

Start with two explicit settings: **v2** and **legacy v1**. Avoid automatic
endpoint fallback in this release. A failed query should retain its actual error,
not silently change protocols.

- Deserialize saved connections without a mode as legacy v1, preserving existing
  installations. Initialize newly created connections as v2. Show the mode in
  settings and connection status; switching an existing connection is explicit.
- For an origin or gateway prefix, append the selected version's path. Accept
  complete `/v1/query` and `/v2/query` URLs, including a trailing slash, only when
  their version matches the selection. Report a mismatch before HTTP; never
  produce `/v2/query/v1/query` or silently rewrite an explicit endpoint.
- Preserve current URL validation, timeout bounds, and backend-only credentials.
  Retain an omitted API key only when the effective endpoint and database
  selection are unchanged. Extend the current tri-state key tests accordingly.
- Add explicit local, database-specific Cloud, and shared Cloud connection modes
  if all three are supported in the initial rollout. Shared Cloud needs
  `X-Helix-Database-Id`; database-specific gateways reject that header.
  [Source: HelixDB HTTP API](https://docs.helix-db.com/database/helix-db/query-guides/http-api).
  If shared Cloud is deferred, document that limit and reject that configuration
  with a useful hint instead of claiming generic Cloud support.
- `test_connection` uses the candidate settings without saving them. Compile and
  decode a bounded count read through the selected adapter. Its success verifies
  that probe, not every operation, the server version, or mutation capability.
- If version/capability discovery is later added, use only verified read-only
  metadata endpoints. Do not invent discovery routes or infer capabilities from
  a timeout, authentication error, or generic 404.

Take one immutable connection snapshot before compilation and reuse it through
execution and decoding. Schema labels and concurrent field samples use that
same snapshot. Prevent results from an old connection updating the new
connection's UI, using a connection revision or the existing request-generation
pattern. Hold no connection lock across network awaits.

## 4. Read planning and v2 lowering

Keep parsing, validation, HTTP, and result decoding in Rust. Introduce a small
logical read plan for named selections, projections, and expected result shapes;
implement independent `LegacyV1` and `V2` lowerers. Do not derive v2 JSON by
lowercasing operation names or merely wrapping today's flat batch.

The v2 lowerer produces this structure, with exact operation payloads from the
pinned contract:

```text
request_type: read
query.read.entries:
  query: { name: <internal name>, root: <nested operation tree> }
query.read.returns: <requested internal names>
```

Use source operations at the innermost position, then wrap them in traversal,
filter, deduplication, ordering, skip/limit, and terminal operations in semantic
order. Predicate comparisons use explicit property expressions and typed
constants. Verify null/missing-property behavior, quoted property names,
virtual fields, compound conditions, `IN`, `BETWEEN`, and supported `LIKE` forms.
Multiple `ORDER BY` terms need verified precedence; nesting single-key sorts is
not sufficient without a stability guarantee.

Keep existing defaults and bounds. Reject an operation unsupported by the chosen
contract with a source span and hint before submission; do not drop it or
substitute a different meaning.

| Statement family | Required parity |
| --- | --- |
| `SELECT` | Nodes/edges, label and property filters, all accepted hops, distinct, ordering, skip/limit, columns/aliases, `*`, count and grouped count |
| `QUERY` | Bounded node selection plus incident edges, `VIA`, requested properties, separate node/edge limits, deduplication and dangling-edge handling |
| `SHOW` | Node/edge labels, combined labels and stats; keep sampled label counts distinct from total entity counts |
| `DESCRIBE` | Exact node/edge lookup, properties, identity, degree, bounded neighbours/incident edges, and directed source/target endpoints |
| Internal reads | Connection probe, schema label/field sampling, startup graph, sidebar queries, and inspector clicks |

For `SELECT *` and graph reads, prefer binding the selected entity stream once
and projecting identity and properties from that binding within one batch, if
the pinned contract supports it. Verify ordering and association explicitly.
Do not zip independently evaluated unordered selections by position. If separate
projections are required, join by a verified entity identity or stable row key
that also preserves duplicate rows. Preserve the current metadata/property
collision policy and test quoted properties named `id`, `label`, `source`, and
`target`; any change to that UI contract needs explicit documentation.

## 5. Preview, decoding, IDs, and execution headers

`compile_query` stays side-effect-free. Give it the selected protocol from
backend connection state, and return protocol, execution kind (`read`), endpoint
path, summary, and wire JSON. Recompile preview when connection settings change.
`run_query` recompiles from source using its own snapshot and returns the actual
compiled metadata; the frontend must not submit arbitrary preview JSON.

Use protocol-specific response adapters before constructing the existing
`QueryResult` variants. For v2, require the expected named returns instead of
accepting an arbitrary single-property object as the requested variable. Test
empty collection and single-result shapes, absent return names, malformed rows,
counts, grouped counts, and endpoint metadata. Do not turn an invalid payload
into an apparently successful empty graph.

Preserve exact IDs across the full read path:

- Retain integer token text until semantic validation distinguishes signed
  property integers from unsigned entity identities.
- Support `u64` IDs in `DESCRIBE` and virtual-ID predicates, including applicable
  edge endpoint paths, lists, and range comparisons. Pin their wire encoding;
  the docs' general numeric parameter types do not prove ID-expression support.
- Validate zero, reject negative IDs and overflow, and keep ordinary integer
  properties signed unless the contract says otherwise. Define and test legacy
  adapter bounds; fail explicitly when a requested ID is outside those bounds.
- Parse JSON exactly in Rust and keep IDs as decimal strings through IPC,
  graph keys, inspector lookup, and generated source. Never convert through a
  JavaScript `number`. Preserve schema inference of large integer properties.

Retain `writerOnly` as a read execution requirement, defaulting to false.
Correct the Rust comment that currently promises it forces routing to a writer.
Do not add a durability wait or cache-warming header to ordinary reads.

| Header | Read policy |
| --- | --- |
| `X-Helix-Require-Writer` | Send only when selected; handle failure without retrying with the requirement removed |
| `X-Helix-Await-Durable` | Never send on a read |
| `X-Helix-Warm` | Keep ordinary probes and queries un-warmed; a future warm action needs its own bodyless-success handling |

The header applicability above follows the
[HTTP API contract](https://docs.helix-db.com/database/helix-db/query-guides/http-api).
Decode documented JSON errors into status, stable server code, and diagnostic
message while preserving existing HQL spans and hints. Preserve unrecognized
errors and transport failures without treating them as protocol-selection signals.

## 6. Implementation sequence and gates

### Phase 0 — Pin and prove the target read contract

1. Identify the supported server builds and deployment modes. Retrieve and
   record the advertised OpenAPI specification, its checksum/version, and the
   corresponding server or official SDK revision.
2. Capture sanitized real-server request/response fixtures for every statement
   family above, empty results, virtual fields, typed predicates, directed
   traversals, ordering, and large IDs. Use an isolated seeded test database;
   capability checks against a user's connection remain read-only.
3. Resolve operation gaps, grouping shapes, row/identity association, ID
   encodings, and gateway/header behavior before claiming parity.

Gate: a concrete compatibility matrix identifies verified operations and any
unsupported cases. A count probe or permissive mock alone cannot pass this gate.

### Phase 1 — Shared plan and versioned compilation

Refactor `hql.rs` around the logical read plan and both lowerers. Add exact
numeric validation and versioned compiled metadata. Keep legacy fixtures as
regressions and add v2 fixtures validated against the pinned contract.

Gate: every supported read form compiles correctly for its adapter; unsupported
forms fail locally with useful diagnostics; compilation performs no HTTP.

### Phase 2 — Connection, transport, and response integration

Update `lib.rs` connection persistence, candidate probing, endpoint resolution,
header handling, error payloads, and protocol-specific decoding in `results.rs`.
Route schema sampling through the same adapter, retaining its numeric inference
and bounded concurrency. Add connection revision handling to discard stale UI
responses.

Gate: saved v1 settings continue working; v2 reads work end-to-end, including
schema and inspector queries; full-range IDs survive lookup and rendering;
requests never mix an endpoint with the other version's body.

### Phase 3 — UI, strict mock, and rollout documentation

Update typed IPC models, connection settings, preview refresh, and the wire
inspector's hard-coded endpoint. In the mock, dispatch by exact endpoint and
validate the matching envelope. Require `request_type: "read"` with only the
read variant for v2; reject flat v2, nested v1, mismatched variants, and writes.
Implement only fixture-backed operations and result shapes.

Update README and PORTING_GUIDE with implemented protocol modes, connection
migration, deployment limits, and exact ID behavior. Keep the app read-only
until mutation acceptance gates pass separately.

Gate: desktop smoke tests cover connect, schema, table, graph, inspector,
protocol switching, and accurate wire preview on both supported versions.

## 7. Verification checklist and completion criteria

- Endpoint tests: origins, bare localhost, gateway prefixes, both full endpoint
  versions, trailing slash, mismatch rejection, and credential/database changes.
- Compiler fixtures: every statement family, each traversal direction, predicates,
  quoted names, alias collisions, grouping, multi-key ordering, and limits.
- Decoder fixtures: empty/missing/malformed returns, properties and identity,
  parallel edges, self-loops, duplicate rows, endpoint direction, and truncation.
- Numeric boundaries: `0`, `2^53 + 1`, `i64::MAX + 1`, `u64::MAX`, overflow,
  negative IDs, and exact signed property values.
- Transport tests: read header policy, structured server errors, no cross-version
  fallback, source-only execution, offline compilation, and stale-response handling.
- Strict mock tests: correct requests pass only at their matching endpoint;
  malformed and cross-version requests fail rather than returning empty success.
- Real-server suite: run the same supported read corpus against the pinned v2
  server and a supported legacy v1 build, comparing semantic results on seeded
  data with explicit ordering where order matters.

Run the app's existing checks from `helix-atlas/` during implementation:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test
npm run typecheck
```

Completion requires those checks, the version-pinned real-server suite, and the
desktop smoke tests. The result is independently usable v2 read compatibility
with explicit legacy support. The mutation plan can then reuse the selected
protocol, exact identities, and decoder contracts without reopening this read
migration.
