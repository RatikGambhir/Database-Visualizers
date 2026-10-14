# HelixSQL mutations

Atlas supports node and directed edge insertion, multi-row values, typed parameters,
`RETURNING`, and ordered atomic mutation blocks. Execution requires v2 and the
bundled **atlas-mutation-v1 HelixDB extension**. The unmodified pinned upstream
server and legacy v1 connections remain read-only in Atlas. See
[server setup and verification](../contracts/helixdb-v2/mutations.md).

Only clicking **Run mutation** (or the editor keyboard shortcut) submits a write.
Compilation, previews, connection probes, schema discovery, and graph refreshes
are read-only. Before each write, Atlas checks the server's capability endpoint;
a successful count probe alone does not enable writes. This check performs no
writes and is separate from the single atomic write request.

## Insert and return

```sql
INSERT INTO NODES:User (name, age)
VALUES ('Alice', 30), ('Bob', 28)
RETURNING id, name;

-- Separate example: these IDs must already identify existing nodes.
INSERT INTO EDGES:Follows (source, target, since)
VALUES (42, 43, 2026)
RETURNING id, source, target;

INSERT INTO NODES:Topic DEFAULT VALUES RETURNING *;
```

Labels and explicit value columns are mandatory. Each tuple creates one entity.
Node `DEFAULT VALUES` supplies an empty property map. Properties support strings,
signed 64-bit integers, finite floats, booleans, and explicit `NULL`; an omitted
property stays absent. Sampled schema does not restrict new labels or properties.

Unquoted `id`, `label`, `score`, and `distance` are reserved metadata. Quote a
physical property such as `"id"`. Internal `$…` properties cannot be written.
Edges require exactly one unquoted `source` and `target`; quoted `"source"` is an
independent property. Endpoints must be existing node IDs, node-ID parameters, or
local node bindings. Parallel edges and self-loops are supported.

Without `RETURNING`, Atlas displays the commit receipt and inserted counts without
a row table. `RETURNING id, name` selects columns; use aliases to distinguish
metadata and properties (`RETURNING id, "id" AS external_id`). `RETURNING *`
returns identity, label, and edge endpoints separately from nested properties.
Creation happens once per tuple regardless of the returning projection.

## Find, create, and connect atomically

```sql
BEGIN MUTATION;
  SELECT * FROM NODES:User WHERE name = 'Alice' AS alice;
  INSERT INTO NODES:User AS bob (name, age)
  VALUES ('Bob', 28) RETURNING id, name;
  INSERT INTO EDGES:Follows (source, target)
  VALUES (@alice, @bob) RETURNING *;
COMMIT;
```

The lookup must match exactly one node. Zero or multiple matches abort the whole
transaction, including earlier inserts. Later lookups see earlier writes. A
lookup can omit the label or use the existing read predicates; it cannot project,
aggregate, traverse, order, group, skip, or limit results.

Bindings are case-sensitive ASCII names, local to one block. They cannot be
reassigned or forward-referenced. Bind only a single inserted node or a node
lookup; edge and multi-row bindings are rejected. Bindings remain node references
independently of `RETURNING`. Every statement has an ordered receipt entry;
lookups do not add to inserted counts. Semicolons separate statements. Nested,
empty, lookup-only blocks and multiple unwrapped statements are rejected.

## Typed parameters

Open **Parameters** beneath the query editor and add a name, type, and value:

```sql
INSERT INTO EDGES:Follows (source, target)
VALUES (:from_id, :to_id) RETURNING *;
```

Use **Node ID** for endpoint values and **Integer** for signed property integers.
Both retain decimal text, including IDs above JavaScript's safe integer range.
Strings, floats, booleans, and null also have explicit types. All node/edge IDs
cross IPC as decimal strings. Parameters supply values, never labels, columns,
or source fragments; missing, unused, and incompatibly reused parameters fail
locally. Parameters also work in supported read predicates.

The native compile/run argument is an optional `parameters` map, for example:

```json
{
  "from_id": { "type": "nodeId", "value": "18446744073709551615" },
  "to_id": { "type": "nodeId", "value": "0" }
}
```

## Outcomes and limits

Writes always require a writer, independently of the read routing preference.
The receipt says **committed / acknowledged**; Atlas requests no durable wait and
makes no durable-storage guarantee. Confirmed guard failures report rollback.
Lost connections, timeouts, and unrecognized post-submit failures report an
unknown outcome. A success response with invalid returned data reports
committed-with-result-error. Atlas never redirects, retries, or falls back to
another endpoint for an insert. Check database state before manually resubmitting
an unknown outcome.

After a successful mutation Atlas refreshes schema and the last loaded graph
using its existing query, parameters, and bounds. A refresh failure leaves the
commit receipt and previous graph visible. Graph bounds can exclude newly created
entities; the receipt still contains the returned identities.

Limits are 1 MiB of source, 1 MiB of serialized parameters, 100 statements,
1,000 total inserted tuples, 2 MiB of compiled plan/write request, and 8 MiB of
response data. Requests exceeding local limits fail before submission. Responses
exceeding the cap after HTTP success report a committed result error. Bulk inserts
are never split into separate transactions or silently truncated.

`UPDATE`, `DELETE`, `UPSERT`, conflict clauses, `INSERT … SELECT`, inline endpoint
selectors, collection bindings, and array/object/vector property literals are
not part of this release. The pinned server's existing limitations on general
virtual-ID comparison/order above `i64::MAX` still apply; exact ID source lookups
and mutation receipts preserve the unsigned range.
