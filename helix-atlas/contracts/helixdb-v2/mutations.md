# Mutation server contract and verification

Verified 2026-10-14 against official HelixDB `v3.5.1`, commit
`c72e64f0c7e480f3d125f071659d5e3ad7b8da15`, with the optional
[atlas-mutation-v1.patch](atlas-mutation-v1.patch). This patch is required for
Atlas mutation execution. It is not an upstream HelixDB release or a claim that
arbitrary v2/Cloud deployments support these writes.

## Port history

The patch was first verified against commit
`64eaaca3026446fb08d1a5331215decc9fe0725b` (`v3.3.0-69`) and ported to `v3.5.1`
on 2026-10-14. The server change is unchanged. Only the router context and the
advertised commit moved, and the tests now parse requests with `simd_json`
because upstream dropped `sonic_rs`. All 31 base, extension, HelixSQL and
high-ID captures re-recorded on `v3.5.1` are byte-identical to the originals.

## Why an extension is required

The unmodified server silently accepts a missing source node, commits preceding
node inserts, and returns no edge. A multi-node reference can fan out creation.
The [base captures](mutation-base-conformance.json) reproduce both behaviors on
a fresh, isolated real server. Existing conditional entries skip execution when
false; they do not provide the required transaction-aborting cardinality check.

The patch adds `{"require_single_node":"materialized_variable"}` as a batch
condition through AST, planner, and interpreter. It returns true only for a
materialized stream with exactly one node. Otherwise it raises an execution
error before commit, rolling back earlier writes. The compiler uses this guard
for lookups and literal endpoints, and reuses guarded node bindings for edges.
Lookup inspection stops at two matches, which detects ambiguity without silently
selecting one. Creation/projection uses the existing materialized `inject`
contract; no creation tree is repeated for returning data.

The server also exposes a read-only `GET /v2/mutation-capabilities` response:

```json
{
  "contract": "atlas-mutation-v1",
  "upstream_commit": "c72e64f0c7e480f3d125f071659d5e3ad7b8da15",
  "mode": "writer",
  "ready": true
}
```

Atlas requires all four values before submitting. Gateway prefixes, bearer auth,
and Shared Cloud database selection are retained for discovery and execution.
The write itself has `x-helix-require-writer: true` and
`x-helix-await-durable: false`. HTTP 200 acknowledges commit, not durable storage.
Unknown responses, transport errors and post-commit decoding failures remain
separate from verified rollback. Discovery does not establish compatibility for
an unrelated server behind a heterogeneous gateway.

## Build the pinned extension

In a disposable checkout, with `ATLAS_ROOT` set to the absolute path of this
repository's `helix-atlas` directory:

```sh
git clone https://github.com/HelixDB/helix-db.git helix-db-atlas
cd helix-db-atlas
git checkout c72e64f0c7e480f3d125f071659d5e3ad7b8da15
git apply --check "$ATLAS_ROOT/contracts/helixdb-v2/atlas-mutation-v1.patch"
git apply "$ATLAS_ROOT/contracts/helixdb-v2/atlas-mutation-v1.patch"
cargo build --locked -p server
cargo test --locked -p db atlas_mutation_ --lib -- --nocapture
```

Verification used Rust 1.97.1, as requested by upstream's toolchain file. The
`compose.yaml` image ([Dockerfile](../../docker/helixdb-atlas/Dockerfile)) runs
the same steps in a container and refuses a patch whose checksum differs. The [mutation manifest](mutation-manifest.json) pins the commit, patch
checksum and patched source checksums. The patch includes the two database tests.
No production database or user connection settings were used for verification.

For an isolated in-memory local server (environment deliberately cleared):

```sh
env -i PATH="$PATH" HELIX_HTTP_ADDR=127.0.0.1:17700 \
  HELIX_GRPC_ADDR=127.0.0.1:17701 target/debug/server
```

This in-memory setup is for testing, not persistent storage. Point Atlas at
`http://127.0.0.1:17700` with protocol v2. Existing deployment configuration and
Cloud gateway support require their own deployment validation.

## Evidence and reproduction

| Evidence | Verified behavior |
| --- | --- |
| `mutation-base-conformance.json` | Five unmodified upstream HTTP captures demonstrate the missing-source and fan-out incompatibilities |
| `mutation-extension-conformance.json` | Sixteen actual HTTP captures: node/null/exact integer properties, existing-node → new-node → edge, missing/ambiguous lookup rollback, missing endpoints, read-your-writes, self-loops, parallel edges |
| `helixsql-mutation-conformance.json` | Rust compiler/executor sources, exact requests and decoded receipts; five failed blocks/bulk statements leave node and edge counts unchanged |
| `mutation-high-id-conformance.json` | Real query-service allocator seeded above `i64::MAX`; created node/edge IDs, directed endpoint terminals and exact node readback |
| Patch database tests | High-ID creation/readback and 32 concurrent source/target endpoint-deletion/insertion races without dangling edges |
| Atlas loopback transport tests | Capability gate, exact wire/headers, no retry/fallback, lost response, confirmed rollback, malformed committed response, unknown errors |
| Atlas DOM workflow tests | Explicit execution, parameter changes, duplicate-submit suppression, preserved receipts after refresh failure, retained graph bounds/parameters |

With a fresh empty server running on port 17700, capture the primitive suite:

```sh
python3 "$ATLAS_ROOT/contracts/helixdb-v2/mutation_capture.py" --isolated
```

For the full Atlas compiler/executor suite, start another **fresh** in-memory
patched server with HTTP 17702 and gRPC 17703, then from the Atlas directory:

```sh
HELIX_MUTATION_CAPTURE_PATH="$ATLAS_ROOT/contracts/helixdb-v2/helixsql-mutation-conformance.json" \
  cargo test --manifest-path src-tauri/Cargo.toml \
  pinned_extension_executes_atomic_helixsql_mutations -- --ignored --nocapture
```

Both suites refuse to seed a nonempty server. The ignored Rust test is fixed to
loopback port 17702; it never reads saved app settings. To regenerate high-ID
captures, run the patched database test with `ATLAS_HIGH_ID_CAPTURE` pointing to
`mutation-high-id-conformance.json`. The base capture command uses `--base` and a
fresh **unpatched** server on HTTP 17698/gRPC 17699.

The mock replays the extension's captured contract with staged-state rollback;
it does not prove server isolation. Full `u64::MAX` compile/IPC boundaries are
synthetic tests; actual high-ID creation was verified above `i64::MAX`, not at
allocator exhaustion. Live Cloud gateways, durable persistence/failover, and
cross-platform deployment are outside this verification. Existing read fixtures
and tests remain independent of the extension.

## Native desktop smoke check

A separately identified macOS app build (`com.ratikgambhir.helixatlas.mutationcheck`)
used the disposable patched server, without changing the normal app configuration.
The native editor created two nodes and their directed edge, displayed ordered
receipts and refreshed schema, and rendered the resulting graph. A second block
bound an existing node, inserted a new node, and connected it. The rebuilt
parameter panel displayed the exact `18446744073709551615` text as a Node ID and
compiled its wire preview. The full runnable walkthrough also executes through
the ignored Rust live-server suite, including every intentional validation and
rollback failure. Post-commit read failure is covered deterministically by DOM
workflow tests.

Final checks: 91 Atlas Rust tests passed (the separate live mutation test also
passed); 235 frontend tests passed; production TypeScript/Vite build, Rust
formatting, and Clippy with warnings denied passed. The two patched database
tests passed. The unrelated live read corpus remains opt-in.
