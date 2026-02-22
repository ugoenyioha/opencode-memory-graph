# OpenCode E2E Runbook (Orbstack FalkorDB)

Repeatable end-to-end test flow for `opencode-memory-graph` using an isolated FalkorDB in Orbstack.

For local-only embedded testing (no remote DB, no cloud embeddings), use `samples/sample-memory-graph-local` with:

```bash
cd plugins/opencode-memory-graph
bun run smoke:local -- --sample-dir ../../samples/sample-memory-graph-local
```

This runbook covers the full lifecycle:

1. bring up isolated DB
2. verify DB connectivity
3. run plugin remote checks
4. bring up TLS ingress endpoint for OpenCode remote mode
5. run OpenCode end-to-end checks
6. run remote soak
7. tear everything down

## Scope and safety

- Uses dedicated namespace: `opencode-memory-graph-test`
- Uses dedicated service/statefulset: `falkordb-memory-graph`
- Does not touch existing `threatforge/falkordb`
- Teardown deletes the full test namespace

## Prerequisites

- Orbstack Kubernetes context available (`kubectl config current-context` should be `orbstack`)
- `bun` installed
- OpenCode installed
- Repo checked out at `opencode-memory-graph`

## 1) Bring up isolated FalkorDB

From repo root:

```bash
kubectl config current-context
kubectl apply -f docs/k8s/orbstack-falkordb-remote-test.yaml
kubectl -n opencode-memory-graph-test rollout status statefulset/falkordb-memory-graph --timeout=180s
kubectl -n opencode-memory-graph-test get pods,svc,pvc
```

Expected:

- pod `falkordb-memory-graph-0` is `Running` and `1/1`
- service `falkordb-memory-graph` exposes `6379` and `3000`
- PVC `data-falkordb-memory-graph-0` is `Bound`

## 2) Verify DB connectivity

In-cluster protocol and graph check:

```bash
kubectl -n opencode-memory-graph-test exec falkordb-memory-graph-0 -- redis-cli ping
kubectl -n opencode-memory-graph-test exec falkordb-memory-graph-0 -- redis-cli GRAPH.QUERY memory "RETURN 1"
kubectl -n opencode-memory-graph-test get endpoints falkordb-memory-graph
```

Expected:

- `PONG`
- query result with `1`
- endpoints populated

## 3) Run plugin remote harness

This validates remote client wiring from local machine to cluster service.

```bash
kubectl -n opencode-memory-graph-test port-forward svc/falkordb-memory-graph 16379:6379 >/tmp/falkordb-memory-graph-portforward.log 2>&1 &
PF_PID=$!
sleep 2

RUN_REMOTE_GRAPH_TEST=1 \
MEMORY_GRAPH_HOST=127.0.0.1 \
MEMORY_GRAPH_PORT=16379 \
MEMORY_GRAPH_TLS=false \
bun test src/graph/remote.test.ts

kill $PF_PID
wait $PF_PID 2>/dev/null
```

Expected:

- `1 pass` for `src/graph/remote.test.ts`

## 4) Bring up TLS ingress endpoint (for OpenCode runtime)

OpenCode runtime validation requires remote host + `MEMORY_GRAPH_TLS=true`.
The base test FalkorDB service is plain TCP, so expose it through Traefik TCP ingress with TLS termination.

1. Create self-signed cert/key (test-only) and Kubernetes secret:

```bash
mkdir -p .tmp/tls
openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
  -keyout .tmp/tls/tls.key \
  -out .tmp/tls/tls.crt \
  -days 2 \
  -subj "/CN=falkordb-memory-graph.usableapps.local" \
  -addext "subjectAltName=DNS:falkordb-memory-graph.usableapps.local,IP:192.168.139.2"

kubectl -n opencode-memory-graph-test create secret tls falkordb-memory-graph-ingress-tls \
  --cert=.tmp/tls/tls.crt \
  --key=.tmp/tls/tls.key
```

2. Apply IngressRouteTCP manifest and verify:

```bash
kubectl apply -f docs/k8s/orbstack-falkordb-remote-test-ingress-tcp.yaml
kubectl -n opencode-memory-graph-test get ingressroutetcp falkordb-memory-graph-tcp
```

3. Verify local DNS resolution (via the cluster DNS gateway plugin):

```bash
dscacheutil -q host -a name falkordb-memory-graph.usableapps.local
```

If resolution is missing, use your local `usableapps.local` resolver setup (nameserver `192.168.139.2`) or a temporary host entry.

4. TLS + Redis smoke test from local machine:

```bash
printf '*1\r\n$4\r\nPING\r\n' | \
  openssl s_client -quiet -connect 192.168.139.2:443 -servername falkordb-memory-graph.usableapps.local
```

Expected:

- Redis response `+PONG`

## 5) OpenCode end-to-end checks

### 5.1 Remote env vars (OpenCode runtime)

OpenCode plugin runtime enforces remote config validation:

- host must be non-local
- `MEMORY_GRAPH_TLS` must resolve to `true`

Use this with the TLS ingress endpoint.

```bash
export MEMORY_GRAPH_MODE="remote"
export MEMORY_GRAPH_HOST="falkordb-memory-graph.usableapps.local"
export MEMORY_GRAPH_PORT="443"
export MEMORY_GRAPH_PASSWORD=""
export MEMORY_GRAPH_TLS="true"
export MEMORY_EMBEDDINGS="off"
export NODE_TLS_REJECT_UNAUTHORIZED="0" # test-only for self-signed cert
```

### 5.2 Start OpenCode with plugin

Ensure your OpenCode config has:

```json
{
  "plugin": ["opencode-memory-graph"]
}
```

Start OpenCode in any test project and run these checks in order:

1. boot check
   - plugin loads without startup errors
2. write/read check
   - create memory-worthy interaction in session
   - run `memory_search` and confirm returned item(s)
   - run `memory_get` on one returned `entity_id` and verify detail payload
3. isolation check
   - confirm project-scoped data does not leak across unrelated project IDs
4. compaction snapshot check
   - trigger/allow compaction path
   - rerun compaction on same boundary and confirm no duplicate snapshot entities

Record date, commit SHA, and pass/fail outcome in your release notes or issue tracker.

### 5.3 Interface dry run (automated, includes pre-context-collapse hook)

Run this scripted interface exercise to trigger plugin interfaces even when remote TLS endpoint is not yet available:

```bash
bun run dryrun:interfaces
```

What it triggers:

- `chat.message`
- `experimental.chat.system.transform`
- `memory_search`
- `memory_get`
- `experimental.session.compacting` (twice, idempotency check)
- `tool.execute.after`

It also verifies global write trust gating by asserting the exact expected failure signal.

## 5.4 Acceptance criteria (must all pass)

- `AC-01 Boot`: OpenCode starts with plugin enabled and no plugin startup errors.
- `AC-02 Remote connect`: plugin can reach remote FalkorDB using configured env vars.
- `AC-03 Write path`: a memory-producing interaction persists at least one entity.
- `AC-04 Search path`: `memory_search` returns the newly persisted entity in relevant results.
- `AC-05 Get path`: `memory_get` on returned `entity_id` returns entity details and 1-hop links.
- `AC-06 Scope boundary`: project-scoped data does not appear from an unrelated project context.
- `AC-07 Compaction idempotency`: repeated compaction on same boundary does not duplicate snapshot entities.
- `AC-08 Security gate`: global write path is blocked without trust flag (`trusted_global=true`).

## 5.5 Suggested OpenCode test prompts

Use these in order during the same test session:

1. "Create and store a memory about choosing FalkorDB for this project because of local+remote parity and Cypher compatibility."
2. "Run `memory_search` for FalkorDB decision context and show top results."
3. "Take one `entity_id` from those results and run `memory_get` for full detail."
4. "Attempt a global-scope write without trusted_global and show the exact failure signal."
5. "Trigger compaction, then trigger it again on the same boundary and confirm no duplicate snapshot entity was created."

## 5.6 Evidence capture template

Capture this block in your issue/release notes for repeatability:

```md
E2E run date: YYYY-MM-DD
Plugin commit: <git sha>
K8s context: orbstack
Manifest: docs/k8s/orbstack-falkordb-remote-test.yaml

AC-01 Boot: PASS|FAIL
AC-02 Remote connect: PASS|FAIL
AC-03 Write path: PASS|FAIL
AC-04 Search path: PASS|FAIL
AC-05 Get path: PASS|FAIL
AC-06 Scope boundary: PASS|FAIL
AC-07 Compaction idempotency: PASS|FAIL
AC-08 Security gate: PASS|FAIL

Notes:

- <important logs/signals>
```

## 6) Remote soak

Run a duration-based remote stability pass against the TLS endpoint.

Short soak example (10 minutes):

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 \
MEMORY_GRAPH_HOST=falkordb-memory-graph.usableapps.local \
MEMORY_GRAPH_PORT=443 \
MEMORY_GRAPH_PASSWORD="" \
MEMORY_GRAPH_TLS=true \
REMOTE_SOAK_SECONDS=600 \
bun run soak:remote
```

24-hour soak example:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 \
MEMORY_GRAPH_HOST=falkordb-memory-graph.usableapps.local \
MEMORY_GRAPH_PORT=443 \
MEMORY_GRAPH_PASSWORD="" \
MEMORY_GRAPH_TLS=true \
REMOTE_SOAK_SECONDS=86400 \
bun run soak:remote
```

Expected:

- JSON summary with `errors: 0`

## CI-gated remote validation

This repo includes `.github/workflows/ci.yml` with an env-gated remote validation job.

Set repository variables/secrets:

- `MEMORY_GRAPH_HOST` (required to enable remote validation job)
- `MEMORY_GRAPH_PORT` (optional, defaults to `443`)
- `MEMORY_GRAPH_TLS` (optional, defaults to `true`)
- `NODE_TLS_REJECT_UNAUTHORIZED` (optional, defaults to `0` for self-signed test certs)
- secret `MEMORY_GRAPH_PASSWORD` (optional for no-auth test endpoints)

When `MEMORY_GRAPH_HOST` is set, CI runs:

```bash
bun test src/graph/remote.test.ts
```

## 7) Teardown (required)

Do not leave the test DB running.

```bash
kubectl delete -f docs/k8s/orbstack-falkordb-remote-test.yaml --ignore-not-found
kubectl delete -f docs/k8s/orbstack-falkordb-remote-test-ingress-tcp.yaml --ignore-not-found
kubectl -n opencode-memory-graph-test delete secret falkordb-memory-graph-ingress-tls --ignore-not-found
kubectl delete namespace opencode-memory-graph-test --ignore-not-found
kubectl get namespace opencode-memory-graph-test
```

Expected:

- namespace no longer exists (`NotFound`)

Optional extra verification:

```bash
kubectl get pvc -A | grep falkordb-memory-graph || true
kubectl get pv | grep falkordb-memory-graph || true
rm -rf .tmp/tls
```

## One-shot command sequence

Use this only for quick manual reruns; keep the stepwise flow above for troubleshooting.

```bash
kubectl apply -f docs/k8s/orbstack-falkordb-remote-test.yaml && \
kubectl -n opencode-memory-graph-test rollout status statefulset/falkordb-memory-graph --timeout=180s && \
kubectl -n opencode-memory-graph-test exec falkordb-memory-graph-0 -- redis-cli ping && \
kubectl -n opencode-memory-graph-test exec falkordb-memory-graph-0 -- redis-cli GRAPH.QUERY memory "RETURN 1"
```
