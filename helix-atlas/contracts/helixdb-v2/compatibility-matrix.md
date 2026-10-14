# Upstream v2 compatibility evidence

> **Re-verified 2026-10-14 on HelixDB `v3.5.1`** (commit
> `c72e64f0c7e480f3d125f071659d5e3ad7b8da15`), the version `compose.yaml` now runs.
> All 41 wire captures were re-recorded on an unmodified `v3.5.1` server. 39 are
> byte-identical. The two malformed-request rejections (`mismatched-envelope`,
> `flat-v2-rejection`) keep HTTP 400 and `invalid_query_json`, but upstream's new
> JSON parser words `msg` differently. All 33 HelixSQL captures are byte-identical.
> Source excerpts below still come from the original pin.

Server source revision: `64eaaca3026446fb08d1a5331215decc9fe0725b`.
`conformance.json` contains 41 actual HTTP captures from an isolated, seeded,
in-memory native server built from that unchanged official checkout. The seed
contains three users, parallel directed edges, and a self-loop. `capture.py`
reproduces the seed and raw operation corpus on the fixed isolated port; the
caller must start a fresh server and explicitly pass `--seed-isolated`.

`helixsql-conformance.json` adds 33 actual compiled HelixSQL requests, raw named
responses, and decoded application results against that same seed. Default Rust
tests replay them without HTTP; JavaScript tests replay the requests against the
strict mock. Application regression checks and desktop outcomes are recorded in
[verification.md](verification.md). This still does not verify every accepted
syntax combination or an arbitrary deployed server.

| Contract area | Evidence | Status |
| --- | --- | --- |
| Read envelope, named returns, source nodes/edges | `count` and every read fixture | HTTP verified |
| Equality, inequalities, ranges, null/missing, membership, compound/string predicates | `predicate-*`, both source/filter modes | HTTP verified |
| Virtual identity, labels, edge endpoints and endpoint property paths | `predicate-id`, `edge-endpoint-paths` | HTTP verified within signed identity range |
| All node/edge traversal directions | `traversal-*` | HTTP verified; raw `other_n` may return both endpoints |
| Dedup and preserved duplicate row identity | `materialized-association` | HTTP verified from one materialized binding |
| Order keys and pagination precedence | `order-and-pagination` | HTTP verified |
| Group counts including null group | `order-and-pagination` | HTTP verified |
| Stored-property/metadata collisions, aliases | `quoted-property-alias-projections`, `materialized-association` | HTTP verified |
| Field sampling and label/count schema reads | `schema-labels-and-bounded-fields` | HTTP verified |
| Describe identity/properties/degree/neighbors/incident edges | `describe-node-directed-details` and endpoint fixtures | HTTP verified |
| Edge identity/properties/source/target association | `materialized-association` | HTTP verified, including parallel edges and self-loop |
| Empty collection vs single result/count | `empty-and-u64-source-acceptance` | HTTP verified |
| Signed property integer `2^53 + 1` | `materialized-association.responseText` | HTTP verified exact JSON integer |
| u64 source IDs above i64 max including u64 max | `empty-and-u64-source-acceptance` | HTTP accepts exact source syntax; absent entities only |
| Actual high-ID entity returned by raw ID terminal | AST/query serializer source pin | Source verified; no actual high-ID entity HTTP fixture |
| Virtual-ID predicates/projections above i64 max | AST/evaluator/projection source pin | Unsupported without special lowering: no u64 constants; virtual IDs clamp |
| Writer read requirement | `read-requires-writer` | HTTP verified on writer; reader rejection source/documentation only |
| Durability header forbidden on reads | `read-rejects-await-durable` | HTTP verified structured error |
| Cross-version/mismatched envelope rejection | `flat-v2-rejection`, `mismatched-envelope` | HTTP verified at v2 |
| Shared Cloud/database-specific gateway behavior | Pinned OpenAPI and official HTTP guide | Documentation only; no Cloud fixture |
| Upstream v1 real-server parity | No matching legacy build available | Not verified; retain and test legacy app fixtures |
| Compiled SELECT/QUERY/SHOW/DESCRIBE and schema sampling | `helixsql-conformance.json`, optional Rust live corpus | HTTP verified at pinned revision, including exact schema samples |
| Desktop UI smoke behavior | `verification.md` | v2 real-server and legacy/v2 mock smoke checked separately |

The count discrepancy in OpenAPI (`[42]`) is resolved by actual HTTP scalar
count fixtures and the pinned serializer. Documented operation-specific gaps
must remain explicit; a passing mock cannot replace this evidence.
