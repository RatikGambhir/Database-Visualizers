# Read compatibility verification — 2026-09-28

Target: unchanged official HelixDB commit
`64eaaca3026446fb08d1a5331215decc9fe0725b`; version/checksum correspondence is
recorded in [manifest.json](manifest.json). The native server ran with in-memory
storage on isolated loopback HTTP port 17696 and gRPC port 17697. It contained
only synthetic fixture data: three users, four directed FOLLOWS edges including
parallel edges and a self-loop. Application reads never wrote to that server.
The separate fixture runner used writes only to seed the fresh isolated server.

## Automated checks

Run from `helix-atlas/`:

```sh
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm test
npm run typecheck
npm run build
```

The original baseline was 24 Rust and 24 JavaScript tests. The expanded suite
passes 42 Rust tests (one live-server test ignored by default) and 66 JavaScript
tests. Formatting, Clippy with warnings denied, TypeScript, and the production
frontend build pass. The isolated Tauri debug build also succeeds.

The primitive corpus [conformance.json](conformance.json) contains 41 actual
HTTP captures. [helixsql-conformance.json](helixsql-conformance.json) contains
33 compiled statements with requests, responses, and decoded results. They cover
SELECT rows/star/count/grouping, all nine traversal forms, filters and nulls,
multi-key order/pagination, property/metadata collisions, graph bounds and VIA,
SHOW variants, directed node/edge inspection, empty results and unsigned sources.
The optional live test also executes schema label/field sampling and asserts
that large integers remain exact and integer-typed, and stored `id` is retained.

With the fresh seeded server running, the read-only application corpus runs as:

```sh
HELIX_V2_TEST_URL=http://127.0.0.1:17696 \
  cargo test --manifest-path src-tauri/Cargo.toml \
  pinned_v2_server_executes -- --ignored --nocapture
```

It passed against the pinned server. To replace the compiler captures during an
intentional contract update, set `HELIX_CAPTURE_PATH` to the fixture output path.
The test normally does not write captures. Default offline tests recompile each
captured source, compare exact request JSON, decode its response, and compare the
expected application result. The strict mock replays the same compiler requests
and must match real response shapes and values. Legacy regression tests preserve
its existing duplicate traversal rows and directed endpoint convention.

To reproduce the seed, build the `server` package from the pinned official
checkout and start a fresh process with `HELIX_HTTP_ADDR=127.0.0.1:17696` and
`HELIX_GRPC_ADDR=127.0.0.1:17697`, without disk/S3 storage environment settings.
Then run `python3 contracts/helixdb-v2/capture.py --seed-isolated`. This runner
restricts seeding to that fixed loopback endpoint and refuses a nonempty database.
Do not use a user's connection for fixture seeding.

## Desktop smoke checks

The actual Tauri app was built/launched with a separate test bundle identifier
and configuration directory. Existing user app credentials/settings were untouched.

| Flow | Pinned v2 server | Legacy/v2 strict mock |
| --- | --- | --- |
| Connect/probe and explicit status mode | Passed, three User nodes/four edges | Passed, 76 nodes/238 edges |
| Schema labels and bounded field samples | Passed; `9007199254740993` displays exactly as integer | Passed; signed maximum property displays exactly |
| SELECT table, quoted `id` alias | Passed; exact ID `0` and separate stored value | Legacy table passed, exact large property |
| Automatic graph loading | Passed, parallel edges/self-loop retained | Passed in both modes |
| Node inspector, relationships/neighbors | Passed, exact zero identity and large property | Legacy passed |
| Directed edge inspector | Passed in live corpus and desktop (source 0 → target 1) | Legacy desktop passed (source 1 → target 18) |
| Wire endpoint/body | Correct `/v2/query` nested read | Correct executed `/v1/query` flat read; switching recomputes v2 preview |
| Protocol switch | Compiled metadata changes with connection revision | Passed; graph reloads and old inspector clears |
| Explicit endpoint mismatch | Backend regression coverage | Desktop v2 + explicit `/v1/query/` rejected locally with useful diagnostic |

Desktop smoke found and corrected rounded large-integer schema samples. Schema
sampling now keeps stored properties separate from metadata, with regression
coverage. Final review also corrected large endpoint properties crossing IPC and
prioritized exact metadata over legacy-looking stored keys. These are functional
checks, not an exhaustive UI race test.

## Conformance limits

- No matching real upstream legacy build was available. Legacy compiler/decoder
  regressions and desktop mock behavior pass; real v1 deployment parity is unverified.
- Shared/database-specific Cloud headers follow pinned official documentation;
  live Cloud authentication, routing and reader rejection are unverified.
- Actual upstream entities above `i64::MAX` were not seeded. The server accepts
  exact full-range unsigned source IDs for nonexistent entities; synthetic
  decoder fixtures cover actual unsigned maximum values, duplicates, and IPC.
- The pinned server has no unsigned predicate constant and clamps virtual-ID
  expressions/projections. Exact source lookups and raw ID terminals avoid that
  issue. Unsupported boundary comparisons and virtual-ID ordering/grouping fail
  locally; grouping a stored `count` property is rejected for output-key collision.
- No mutation language, write rollback/integrity, or write capability claim is
  established by read tests or the isolated seed. Mutation gates remain separate.
