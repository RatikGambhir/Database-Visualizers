# syntax=docker/dockerfile:1.7
# HelixDB at the pinned upstream release plus the atlas-mutation-v1 patch.
# Build through compose.yaml, which supplies the `contracts` build context.

ARG RUST_IMAGE=rust:1.97.1-bookworm
ARG RUNTIME_IMAGE=gcr.io/distroless/cc-debian12:nonroot

FROM ${RUST_IMAGE} AS builder

# Must match contracts/helixdb-v2/mutation-manifest.json.
ARG HELIX_COMMIT=c72e64f0c7e480f3d125f071659d5e3ad7b8da15
ARG PATCH_SHA256=03e99e0b8647e66fe3c6fcc951511dcb6b60ee682c1cb6ea8f03bc35cbcd34c2
ARG RUN_PATCH_TESTS=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential ca-certificates clang cmake git libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
RUN git init -q . \
    && git remote add origin https://github.com/HelixDB/helix-db.git \
    && git fetch -q --depth 1 origin "${HELIX_COMMIT}" \
    && git checkout -q FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${HELIX_COMMIT}"

COPY --from=contracts atlas-mutation-v1.patch /tmp/atlas-mutation-v1.patch
RUN echo "${PATCH_SHA256}  /tmp/atlas-mutation-v1.patch" | sha256sum -c - \
    && git apply /tmp/atlas-mutation-v1.patch

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/workspace/target \
    if [ "${RUN_PATCH_TESTS}" = "1" ]; then \
        cargo test --locked -p db atlas_mutation_ --lib; \
    fi \
    && cargo build --locked --release --package server --bin server \
    && cp target/release/server /tmp/helix-server \
    && install -d -m 1777 /tmp/runtime-root/tmp \
    && install -d -o 65532 -g 65532 -m 0755 /tmp/runtime-root/var/lib/helix

FROM ${RUNTIME_IMAGE}

COPY --from=builder /tmp/runtime-root/ /
COPY --from=builder /tmp/helix-server /bin/helix-server

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    HELIX_HTTP_ADDR=0.0.0.0:8080 \
    HELIX_GRPC_ADDR=127.0.0.1:8081 \
    DB_PATH=db/ \
    RUST_LOG=server=info,db=info,slatedb=info

LABEL org.opencontainers.image.title="helixdb-atlas" \
    org.opencontainers.image.description="HelixDB v3.5.1 with the atlas-mutation-v1 patch." \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.source="https://github.com/HelixDB/helix-db" \
    org.opencontainers.image.revision="c72e64f0c7e480f3d125f071659d5e3ad7b8da15"

WORKDIR /home/nonroot
USER 65532:65532
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/bin/helix-server"]
