# Pinned HelixDB v2 read contract

> **Re-verified 2026-10-14 on HelixDB `v3.5.1`** (commit
> `c72e64f0c7e480f3d125f071659d5e3ad7b8da15`), the version `compose.yaml` now runs.
> All 41 wire captures were re-recorded on an unmodified `v3.5.1` server. 39 are
> byte-identical. The two malformed-request rejections (`mismatched-envelope`,
> `flat-v2-rejection`) keep HTTP 400 and `invalid_query_json`, but upstream's new
> JSON parser words `msg` differently. All 33 HelixSQL captures are byte-identical.
> Source excerpts below still come from the original pin.

Pinned on 2026-09-28 to official repository commit
[`64eaaca3026446fb08d1a5331215decc9fe0725b`](https://github.com/HelixDB/helix-db/tree/64eaaca3026446fb08d1a5331215decc9fe0725b).
The unmodified canonical [OpenAPI document](https://www.helix-db.com/openapi.json)
is saved as `openapi.json`, with its checksum and source correspondence in
`manifest.json`. It is byte-identical to `docs/openapi.json` at that commit.
API version: `2.0.0`. The corresponding Rust SDK manifest says `3.0.0`;
the repository describes itself as `v3.3.0-69-g64eaaca3`. These are distinct
version identifiers. They do not identify an arbitrary user's server.

The OpenAPI document deliberately leaves `OperationTree.additionalProperties`
open and does not enumerate operations. Its response example presents count as
`[42]`; the implementation and HTTP guide return scalar `42`. AST source and
query-service serializer excerpts are therefore pinned alongside the document.
Each excerpt records original path and line numbers; the manifest hashes whole
source files. These excerpts are from the Apache-2.0 licensed official HelixDB
repository. They are evidence, not application code.

## Exact read shapes

The envelope is `request_type: "read"`, `query.read.entries` containing
`{"query":{"name":"…","root":…}}`, and `query.read.returns` listing names.
Names omitted from returns still execute. Response is a top-level object keyed
by each declared return. Nonempty entity and projection results are arrays even
when at-most-one. Empty at-most-one can be `null`; empty many is `[]`.

| Purpose | Operation payload |
| --- | --- |
| All entities | `nodes` / `edges`: `{"reference":"all"}` |
| Exact IDs | `nodes` / `edges`: `{"reference":{"ids":[0,18446744073709551615]}}` |
| Filtered source | `nodes_where` / `edges_where`: `{"predicate":…}` |
| Re-read variable IDs | `nodes` / `edges`: `{"reference":{"var":"name"}}` |
| Reuse materialized rows | `inject`: `{"variable":"name"}` with input omitted |
| Traversals | `out`, `in`, `both`, `out_e`, `in_e`, `both_e`: `{"input":…,"label":"optional edge label"}` |
| Edge endpoints | `in_n` is source, `out_n` is target: `{"input":…}` |
| Filter | `where`: `{"input":…,"predicate":…}` |
| Distinct entities | `dedup`: `{"input":…}` |
| Pagination | `skip` / `limit`: `{"input":…,"count":{"literal":N}}` |
| Single sort | `order_by`: `{"input":…,"property":"name","order":"asc"}` |
| Ordered sort keys | `order_by_multiple`: `{"input":…,"orderings":[["age","desc"],["name","asc"]]}` |
| Properties | `value_map`: `{"input":…}` for all, or add `"properties":["$id","name"]` |
| Aliases | `project`: `{"input":…,"projections":[{"property":{"source":"name","alias":"display"}}]}` |
| Terminals | `id`, `label`, `count`: `{"input":…}` |
| Group counts | `group_count`: `{"input":…,"property":"status"}` |

Multi-key ordering compares keys in the declared order; the first unequal key
wins, then runtime row identity breaks ties. Missing values precede present
values in ascending order and follow in descending. Nesting single sorts is
not equivalent. `group_count` returns rows
`[{"status":"active","count":2},…]`, including null for missing grouping
properties; it does not return an object mapping group keys to counts.

Virtual property names are `$id`, `$label`, `$from`, `$to`; endpoint property
paths are `$from.name`, `$to.name`, `$from.$id`, `$to.$id`. Ordinary properties
such as `id`, `label`, `source`, and `target` are independent stored properties.
`value_map` without a property filter returns stored properties plus `$id`.
The raw entity stream returns `[{"$id":0}]`, with no stored property payload.

## Predicate shapes

`SourcePredicate` is the same type as `Predicate`. Expressions use
`{"property":"name"}` and `{"constant":<typed value>}`. Typed values include
`{"i64":1}`, `{"f64":1.5}`, `{"string":"Ada"}`, `{"bool":true}`, the unit
string `"null"`, and heterogeneous `{"array":[{"i64":1},{"string":"x"}]}`.
There is no `u64` constant variant.

| Predicate | Payload |
| --- | --- |
| `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | `{"left":expr,"right":expr}` |
| `between` | `{"value":expr,"min":expr,"max":expr}` (inclusive) |
| `has_key`, `is_null`, `is_not_null` | `{"property":"name"}` |
| `starts_with` | `{"value":expr,"prefix":expr}` |
| `ends_with` | `{"value":expr,"suffix":expr}` |
| `contains` | `{"value":expr,"substring":expr}` |
| `is_in` | `{"value":expr,"values":expr}`; values is a typed array constant |
| `and`, `or` | `{"predicates":[predicate,…]}` |
| `not` | `{"predicate":predicate}` |

Missing expression properties resolve to null. `is_null` matches missing or
explicit null; `is_not_null` requires present and nonnull; `has_key` also
matches a present null. Equality with null therefore includes missing values.
String matching requires both operands to be strings. The string operations
support exact text, prefixes, suffixes, and substrings; there is no general
SQL wildcard operation.

## Identity association and unsigned limits

Entity references and raw `id()` results use exact `u64`. However, this server
revision clamps virtual identity expressions/projections (`$id`, `$from`,
`$to`, endpoint `$id`, and expression `id`) above `i64::MAX` to `i64::MAX`.
`edge_properties` and unfiltered `value_map` have the same issue. Do not invent
a `u64` typed constant or claim full-range identity predicate support.

Materialize a selected entity stream in a named batch entry once. Derive
properties and identity with source `inject` against that binding. It clones
the original stream, preserving order and duplicate rows. `value_map` emits
exactly one object for each entity row; `id` emits one exact unsigned ID.
Unlike independently evaluated sources, positional combination of those
projections has an implementation guarantee, with row-count checks required.
For edges, derive source and target `id` arrays from `in_n` and `out_n` over the
same injected edge binding. They preserve input order and yield one endpoint
per valid edge; absent endpoint data must produce a length mismatch error.
A raw stream with row bindings can also expose unsigned IDs as
`{"current":{"node":…},"bindings":{"name":{"edge":…}}}`.

Exact full-range lookup is supported by `nodes/edges.reference.ids` and can be
read back through raw ID terminals. General virtual-ID comparison and ordering
above the signed range remain unsupported by this pinned implementation.
Actual high-ID entity projection needs a specially seeded upstream database;
looking up a nonexistent large ID only proves request acceptance.

## Transport and deployment scope

`POST /v2/query` is the only advertised query path. Boolean headers accept
true/false/1/0. Require-writer rejects a non-writer; it does not route or retry.
Reads must not send await-durable. Cache warming has separate 204 handling and
is excluded from normal query/probe execution. JSON failures use
`{"error":"stable_code","msg":"diagnostic"}`.

Shared Cloud requires bearer key plus `X-Helix-Database-Id`. Database-specific
Cloud rejects database/tenant selector headers. These gateway contracts are
from the OpenAPI/HTTP guide, not verified against a Cloud deployment here.
Canonical docs: [HTTP API](https://docs.helix-db.com/database/helix-db/query-guides/http-api)
and [operation trees](https://docs.helix-db.com/database/helix-db/core-concepts/overview).

Real-server captured fixtures and exact scope are recorded separately in
`conformance.json` when a pinned isolated server run succeeds. No v1 upstream
server fixture or Cloud gateway conformance is implied by the v2 source pin.

## Optional mutation extension

Reads remain compatible with the unmodified pin and with unmodified `v3.5.1`. Mutation execution requires
[atlas-mutation-v1](mutations.md), including its server patch, capability
endpoint, transaction guards, and separate real-server evidence.
