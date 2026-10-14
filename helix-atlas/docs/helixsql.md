# HelixSQL query syntax

HelixSQL is Helix Atlas's query and mutation language. This page covers reads;
see [mutations](mutations.md) for inserts and atomic blocks. Choose the connection's
**v2** or **legacy v1** protocol in Connection settings; Rust compiles the same
source for that protocol. The Wire format tab shows the resolved endpoint and
compiled request. Run one statement at a time with **Run query** or **Cmd/Ctrl +
Enter**. A final semicolon is optional.

Examples use `User`, `Follows`, `name`, and `age`; substitute your graph's actual
labels/properties from Schema. Labels and property names are case-sensitive;
keywords are case-insensitive.

## Quick start

```sql
-- Table of nodes.
SELECT * FROM NODES:User LIMIT 25;

-- Selected columns, a filter, and server-side ordering.
SELECT id, name, age
FROM NODES:User
WHERE age >= 25
ORDER BY age DESC, name ASC
LIMIT 50;

-- Draw a bounded graph of users and their relationships.
QUERY NODES:User VIA Follows WITH name LIMIT 150 EDGE LIMIT 600;

-- Follow outgoing relationships from Alice.
SELECT DISTINCT id, name
FROM NODES:User WHERE name = 'Alice'
TRAVERSE OUT Follows
LIMIT 50;

-- Inspect one exact node or edge ID.
DESCRIBE NODE 42;
DESCRIBE EDGE 7;

-- Discover labels and totals.
SHOW LABELS;
SHOW STATS;
```

## SELECT: tables, counts, and groups

Square brackets below mean an optional clause; `…` means repetition.

```text
SELECT [DISTINCT] (* | COUNT(*) | column [AS alias] [, …])
FROM (NODES | EDGES) [:Label]
[WHERE condition]
[TRAVERSE direction [EdgeLabel] [WHERE condition]] …
[GROUP BY column]
[ORDER BY column [ASC | DESC] [, …]]
[SKIP n] [LIMIT n]
```

Use clauses in that order. `SKIP` and `LIMIT` may appear in either order;
`OFFSET` is an alias for `SKIP`. Paging uses nonnegative integer counts and skips
before limiting. Row queries default to 500 rows. `COUNT(*)` has no implicit
row limit. `DISTINCT` deduplicates entities by identity before projection; two
different entities with equal property values remain two rows.

```sql
SELECT id, label FROM NODES LIMIT 20;
SELECT id, label, source, target, since FROM EDGES:Follows LIMIT 50;
SELECT name AS person, age AS years FROM NODES:User ORDER BY name;
SELECT id, name FROM NODES:User ORDER BY name SKIP 50 LIMIT 25;
SELECT COUNT(*) FROM NODES:User WHERE age >= 18;
SELECT COUNT(*) FROM NODES GROUP BY label;
SELECT COUNT(*) FROM NODES:User GROUP BY city;
```

`GROUP BY` accepts one column and requires `COUNT(*)`. `COUNT(*)` cannot be mixed
with other projected columns or `ORDER BY`. If a count/group query has paging,
the paging limits the entities being counted, not the resulting groups.
`ORDER BY` refers to source property/virtual names; `AS` names only output
columns. Sorting a displayed table affects fetched rows; query `ORDER BY`
controls the server's selection.

## Properties, virtual columns, and quoting

| Column | Meaning |
| --- | --- |
| `id` / `$id` | Entity identity; returned as an exact decimal string |
| `label` / `$label` | Entity label |
| `source` / `$from.$id` | Source node ID of an edge |
| `target` / `$to.$id` | Target node ID of an edge |
| `score` / `$score`, `distance` / `$distance` | Values where the server supplies them |
| Any other name | Stored property of the current entity |

Double quotes select a stored property, even when its name is reserved. Use
distinct aliases when selecting both metadata and a property with the same name.
`SELECT *` displays canonical identity/endpoint columns; use explicit quoted
projections to read stored values that collide with those display names.

```sql
SELECT id AS entity_id, "id" AS external_id,
       label AS entity_label, "label" AS stored_label
FROM NODES:User LIMIT 25;

SELECT source AS source_node, "source" AS import_source
FROM EDGES:Follows LIMIT 25;

SELECT "display name" FROM NODES:"Research Group" LIMIT 10;
SELECT "a""quoted""property" FROM NODES LIMIT 10;
```

Single quotes are string values; double a quote to escape it. Supported literals
are strings, signed integers, finite floating-point numbers, `TRUE`, `FALSE`, and
`NULL`. Queries support `-- line comments` and `/* block comments */`.

```sql
SELECT id FROM NODES WHERE surname = 'O''Brien';
SELECT id FROM NODES WHERE "active" = TRUE AND "score" > 0.5;
```

## WHERE conditions

| Form | Example |
| --- | --- |
| Equality / inequality | `age = 30`, `age != 30`, `age <> 30` |
| Ordered comparisons | `age > 18`, `age >= 18`, `age < 65`, `age <= 65` |
| Inclusive range | `age BETWEEN 25 AND 40`, `age NOT BETWEEN 25 AND 40` |
| Membership | `city IN ('Osaka', 'Lagos')`, `age NOT IN (20, 21)` |
| Missing/null checks | `bio IS NULL`, `bio IS NOT NULL` |
| Property presence | `HAS(bio)` |
| String patterns | `name LIKE 'Ali%'`, `name LIKE '%son'`, `name LIKE '%li%'` |
| Negated pattern | `name NOT LIKE 'A%'` |
| Boolean composition | `AND`, `OR`, `NOT`, parentheses |

`NOT` binds more tightly than `AND`, which binds more tightly than `OR`.
Comparisons take a column on the left and a literal on the right; arbitrary
expressions, column-to-column comparisons, and SQL functions are not supported.
An `IN` list must contain at least one value.

```sql
SELECT id, name FROM NODES:User
WHERE age BETWEEN 25 AND 40
  AND (city IN ('Osaka', 'Lagos') OR NOT HAS(city))
ORDER BY name LIMIT 50;
```

In v2, `IS NULL` matches missing or explicitly null properties. `HAS` matches a
present property even when it contains null. Virtual identity fields cannot be
null. `LIKE` supports `%` only at the beginning/end, and does not support `_` or
interior wildcards such as `'a%b'`. Use `=` for exact string matching.

## TRAVERSE: follow the graph

Each hop operates on the current entity stream. A hop's `WHERE` filters the
entities it lands on. The optional edge label restricts that hop. Repeat
`TRAVERSE` for multiple hops.

| Direction | Start | Result |
| --- | --- | --- |
| `OUT` | Nodes | Nodes reached through outgoing edges |
| `IN` | Nodes | Nodes reached through incoming edges |
| `BOTH` | Nodes | Neighboring nodes in either direction |
| `OUT EDGES` | Nodes | Outgoing edges |
| `IN EDGES` | Nodes | Incoming edges |
| `BOTH EDGES` | Nodes | Incident edges |
| `SOURCE` | Edges | Source nodes |
| `TARGET` | Edges | Target nodes |
| `OTHER` | Edges | Other endpoint relative to the traversal origin where available |

For a standalone edge stream, the pinned v2 `OTHER` operation may yield both
endpoints. Use `SOURCE`/`TARGET` for a particular directed endpoint.

```sql
SELECT DISTINCT id, name
FROM NODES:User WHERE name = 'Alice'
TRAVERSE OUT Follows
TRAVERSE OUT Follows
LIMIT 100;

SELECT id, source, target, since
FROM NODES:User WHERE name = 'Alice'
TRAVERSE OUT EDGES Follows WHERE since >= 2022
LIMIT 50;

SELECT DISTINCT id, name
FROM NODES:User WHERE name = 'Alice'
TRAVERSE OUT EDGES Follows WHERE since >= 2022
TRAVERSE TARGET
LIMIT 50;
```

A node hop from an edge stream, or an endpoint hop from a node stream, fails
before HTTP. Use `DISTINCT` if repeated paths should return each entity once.

## QUERY: graph visualization

```text
QUERY [[FROM] NODES[:Label]]
[WHERE condition]
[TRAVERSE direction [EdgeLabel] [WHERE condition]] …
[VIA EdgeLabel]
[WITH property [, …]]
[ORDER BY column [ASC | DESC] [, …]]
[SKIP n] [LIMIT n] [EDGE LIMIT n]
```

`QUERY` defaults to all nodes and always finishes on nodes. `GRAPH` remains a
compatibility alias. Selected nodes are deduplicated; `LIMIT` defaults to 400
nodes and `EDGE LIMIT` to 2000 edges. `VIA` restricts the displayed edge label;
it does not traverse to additional nodes. `WITH` limits requested node properties
for labels/details; omit it to fetch all stored node properties.

```sql
QUERY LIMIT 300 EDGE LIMIT 1000;
QUERY NODES:User VIA Follows WITH name, age LIMIT 150 EDGE LIMIT 600;
QUERY NODES WHERE id = 42 TRAVERSE BOTH WITH name LIMIT 200;
QUERY NODES:User WHERE age >= 25 ORDER BY age DESC, name LIMIT 100;
```

v2 fetches incident edges from the exact bounded node selection; legacy v1 keeps
its outgoing-edge behavior. Only edges whose endpoints are both selected can be
drawn. Edges leading outside the selection are counted as dangling and reported
by the canvas. Increase the node cap or expand a neighborhood to include them.
Double-click a node to put a neighborhood query in the editor.

## SHOW and DESCRIBE

```sql
SHOW LABELS;
SHOW NODE LABELS SAMPLE 10000;
SHOW EDGE LABELS SAMPLE 10000;
SHOW STATS SAMPLE 10000;

DESCRIBE NODE 42 LIMIT 100;
DESCRIBE EDGE 7;
```

`SHOW LABELS` lists both node and edge labels. Label counts use a bounded sample,
defaulting to 5000 entities per side, so rare labels can be missed. `SHOW STATS`
also returns total node/edge counts; those totals are distinct from sampled label
breakdowns. These reads do not provide an authoritative schema catalog.

`DESCRIBE NODE` returns identity, stored properties, degree, and bounded incident
edges/neighbors (default limit 200). `DESCRIBE EDGE` returns identity, stored
properties and directed source/target nodes. IDs include zero and are distinct
between node and edge spaces.

## Exact IDs and protocol limits

v2 source IDs accept the unsigned range `0` through `18446744073709551615`.
Property integers use `-9223372036854775808` through `9223372036854775807`.
Large integer values stay exact and display as strings when JavaScript cannot
represent them safely. Do not convert IDs to JavaScript numbers.

```sql
DESCRIBE NODE 18446744073709551615;
SELECT id FROM NODES WHERE id = 18446744073709551615;
SELECT id FROM NODES WHERE id IN (0, 9223372036854775808, 18446744073709551615);
```

These examples illustrate accepted lookup syntax; they return no entity unless
that ID exists. Exact ID equality/membership must be the standalone initial
`WHERE` condition to use unsigned source lowering. You can still use a source
label and subsequent traversal filters. General ID comparisons at the upper
signed boundary, compound high-ID predicates, and high endpoint-ID comparisons
cannot be represented safely by the pinned v2 server. Virtual-ID ordering and
grouping are rejected; order/group by stored properties instead. Grouping a
stored property named `count` is also unsupported in v2 because it collides with
the server's aggregate output key. Legacy entity references stop at `i64::MAX`.

The app currently supports no writes, joins, subqueries, arbitrary functions,
parameters, multiple statements, or mutation blocks. The mutation language is
tracked separately in [its plan](../plans/helixsql-mutation-language.md).
See [verification](../contracts/helixdb-v2/verification.md) for the exact tested
server revision and remaining Cloud/legacy/high-ID conformance gaps.

## Insertions and atomic blocks

See the [mutation syntax guide](mutations.md) for `INSERT`, `BEGIN MUTATION`,
typed parameters and `RETURNING`, and the [runnable walkthrough](mutation-walkthrough.md)
for a complete demo graph and rollback tests. Writes require the pinned server extension.
