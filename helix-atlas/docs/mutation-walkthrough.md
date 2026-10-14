# Test the app with a connected demo graph

Use protocol **v2** with the [patched server](../contracts/helixdb-v2/mutations.md),
or run `npm run mock` for a local UI demo. The Docker legacy image does not support
these mutations. Run each code block separately. Start with an empty Parameters
form. These examples use dedicated `AtlasDemoPerson` and `AtlasDemoFollows` labels.
Run the setup once: inserts create additional entities when repeated.

## 1. Create two people and an edge in one transaction

```sql
BEGIN MUTATION;
  INSERT INTO NODES:AtlasDemoPerson AS alice (name, age, active, bio)
  VALUES ('Alice', 30, TRUE, NULL)
  RETURNING *;

  INSERT INTO NODES:AtlasDemoPerson AS bob (name, age, active)
  VALUES ('Bob', 28, TRUE)
  RETURNING id, name;

  INSERT INTO EDGES:AtlasDemoFollows (source, target, since)
  VALUES (@alice, @bob, 2026)
  RETURNING id, source, target, since;
COMMIT;
```

Expect **2 nodes, 1 edge**, a committed/acknowledged receipt, three ordered results,
and exact string IDs. Click an ID to inspect it. Check Wire format for one write
batch and one `add_n`/`add_e` per created entity.

## 2. Read and filter

```sql
SELECT id, name, age, active, bio
FROM NODES:AtlasDemoPerson
ORDER BY age DESC;
```

Expect Alice then Bob. Alice has explicit null `bio`; Bob has no `bio` property.
The table displays both as null. Test the distinction with `HAS`:

```sql
SELECT name FROM NODES:AtlasDemoPerson
WHERE HAS(bio) AND bio IS NULL;
```

Expect Alice only.

```sql
SELECT name, age FROM NODES:AtlasDemoPerson
WHERE age BETWEEN 25 AND 35 AND active = TRUE AND name LIKE 'A%';
```

Expect Alice only.

## 3. Draw and traverse

```sql
QUERY NODES:AtlasDemoPerson
VIA AtlasDemoFollows WITH name, age
LIMIT 20 EDGE LIMIT 40;
```

Expect Alice → Bob. Try pan, zoom, dragging, selection, and the inspector.
This becomes the graph query refreshed after later successful mutations.

```sql
SELECT id, name FROM NODES:AtlasDemoPerson
WHERE name = 'Alice'
TRAVERSE OUT AtlasDemoFollows;
```

Expect Bob.

```sql
SELECT id, source, target, since FROM EDGES:AtlasDemoFollows;
```

Check edge direction against the graph and inspect the source and target links.

## 4. Find an existing person and connect a new person

```sql
BEGIN MUTATION;
  SELECT * FROM NODES:AtlasDemoPerson WHERE name = 'Bob' AS bob;
  INSERT INTO NODES:AtlasDemoPerson AS cara (name, age, active)
  VALUES ('Cara', 35, TRUE) RETURNING id, name;
  INSERT INTO EDGES:AtlasDemoFollows (source, target, since)
  VALUES (@bob, @cara, 2026) RETURNING *;
COMMIT;
```

Expect **1 node, 1 edge**, plus a lookup result for Bob. Reopen Graph to see
Alice → Bob → Cara. The lookup does not count as an inserted node.

## 5. Bulk insertion, aliases, and exact large property integers

```sql
INSERT INTO NODES:AtlasDemoImported (name, "id", external_number)
VALUES ('Dan', 'crm-dan', 9007199254740993),
       ('Eve', 'crm-eve', 9223372036854775807)
RETURNING id, name, "id" AS external_id, external_number;
```

Expect **2 nodes** in input tuple order. Internal `id` and physical `external_id`
stay distinct. Both large integers must display exactly without rounding.

```sql
INSERT INTO NODES:AtlasDemoTopic DEFAULT VALUES;
```

Expect **1 node** and a receipt without a returned row table.

## 6. Parallel edges and a self-loop

```sql
BEGIN MUTATION;
  SELECT * FROM NODES:AtlasDemoPerson WHERE name = 'Alice' AS alice;
  SELECT * FROM NODES:AtlasDemoPerson WHERE name = 'Bob' AS bob;
  INSERT INTO EDGES:AtlasDemoFollows (source, target, since)
  VALUES (@alice, @bob, 2027), (@alice, @alice, 2027)
  RETURNING *;
COMMIT;
```

Expect **0 nodes, 2 edges**. Alice now has two distinct edges to Bob and a loop.

## 7. Typed parameters

In **Parameters**, add `person_name` with type **String**, value `Param Person`,
and `person_age` with type **Integer**, value `41`.

```sql
INSERT INTO NODES:AtlasDemoPerson (name, age)
VALUES (:person_name, :person_age)
RETURNING id, name, age;
```

Expect one created person. Change a parameter and confirm the preview recompiles.
Remove these parameters before running unrelated queries; unused parameters are
rejected to catch mistakes.

To test node-ID parameters, add `from_id` and `to_id`, both type **Node ID**,
and paste Alice and Bob's IDs from their receipts (without quotes):

```sql
INSERT INTO EDGES:AtlasDemoFollows (source, target)
VALUES (:from_id, :to_id) RETURNING id, source, target;
```

Expect one directed edge. Node-ID text must survive unchanged, including `0`.
Use actual existing IDs: a huge arbitrary ID is useful for testing rollback,
but will not create a missing endpoint. Clear Parameters afterward.

## 8. Confirm rollback after an earlier insert

```sql
BEGIN MUTATION;
  INSERT INTO NODES:AtlasDemoRollback (name) VALUES ('must disappear');
  SELECT * FROM NODES:AtlasDemoMissingLabel AS missing;
COMMIT;
```

Expect a **rolled back** error, followed by zero from:

```sql
SELECT COUNT(*) FROM NODES:AtlasDemoRollback;
```

## 9. Confirm ambiguous lookup rollback

```sql
BEGIN MUTATION;
  INSERT INTO NODES:AtlasDemoRollback DEFAULT VALUES;
  SELECT * FROM NODES:AtlasDemoPerson AS ambiguous;
COMMIT;
```

Expect a rolled-back exact-one error because multiple people match. Re-run the
rollback count query: it must still be zero.

## 10. Validation errors without a write

Run each separately. The editor should show an error and prevent submission:

```sql
INSERT INTO NODES (name) VALUES ('missing label');
```

```sql
INSERT INTO EDGES:AtlasDemoFollows (source, target) VALUES (-1, 0);
```

```sql
INSERT INTO NODES:AtlasDemoPerson (name, age) VALUES ('wrong width');
```

```sql
BEGIN MUTATION;
  INSERT INTO EDGES:AtlasDemoFollows (source, target) VALUES (@later, @later);
  INSERT INTO NODES:AtlasDemoPerson AS later DEFAULT VALUES;
COMMIT;
```

## 11. Schema and statistics

```sql
SHOW STATS;
```

```sql
SHOW LABELS;
```

Check schema refresh, label counts, generated starter queries, history, and the
Wire format tab. With the demo alone, after steps 1–7 there are **7 nodes and
5 edges**. The successful mutations remain committed after the failure tests.
Counts include the parameterized examples exactly once.

To test refresh failure handling deterministically, the automated workflow test
`mutationWorkspace.test.tsx` injects graph/schema read failures after commit and
checks that the receipt survives. Stopping a real server during submission can
produce an **unknown** outcome; that is not evidence of rollback and must not
trigger automatic retry.

To repeat from scratch, restart the disposable in-memory server or mock. Atlas
does not implement deletion yet; no cleanup query is silently issued.
