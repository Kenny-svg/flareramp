# Deployment runbook

## Topology

Deploy two Node.js services:

1. `web`: public Next.js service.
2. `executor`: one private operator service with persistent storage.

Only the web service should be internet-facing. Restrict executor port 3001 to
the web service and monitoring network.

## Configuration

Copy the two `.env.example` files and inject values through the hosting
platform's secret manager. Required server values include:

- `XAMAN_API_KEY`, `XAMAN_API_SECRET`
- `EXECUTOR_PRIVATE_KEY` on executor only
- `EXECUTOR_ADDRESS` on web
- `VERIFIER_API_KEY_TESTNET`, `COSTON2_DA_LAYER_URL`
- `WATCHED_XRPL_ADDRESS` set to the live Core Vault
- `EXECUTOR_STATUS_URL` set to the private executor URL
- persistent `TRANSACTION_STORE_PATH`

Do not depend on the local sibling `.env` fallback in separate deployments.

## Release

```bash
npm ci
npm run ci
npm run build
```

Start executor first, then web:

```bash
npm run start --workspace executor
npm run start --workspace web
```

## Verification

```bash
curl -f https://EXECUTOR_INTERNAL/health
curl -f https://EXECUTOR_INTERNAL/ready
curl -f https://WEB/
```

Confirm `/ready` reports both store and watcher ready. Monitor `/metrics` for
pending, successful and failed jobs. Preserve structured JSON logs and alert on
watcher disconnects, FDC timeout errors, exhausted retries and readiness
failure.

## Rollback and recovery

Stop the old executor before starting a replacement against the same JSON store.
Restore the persistent volume, start one instance, and let `resumePending()`
recover jobs. Never delete the store or resend XRPL payments to fix an outage.

For judge-facing external outages, enable `DEMO_REPLAY_ENABLED=true` and use
`/demo/replay`. That route is recorded evidence and never a live transaction.
