# Architecture

```text
Browser
  │  review/sign/status/receipt
  ▼
Next.js web server ───── Xaman API
  │                      XRPL Testnet
  │ operator status      Coston2 RPC / FTSO
  ▼
Operator executor
  ├─ XRPL Core Vault watcher
  ├─ durable JSON transaction store
  ├─ FDC verifier → FdcHub → Relay → DA Layer
  └─ AssetManager.executeDirectMinting
```

The browser only receives public transaction details and Xaman links. Xaman
credentials, verifier keys and the executor's Coston2 key remain server-side.

The executor normalizes each XRPL hash into one durable job:

`observed → confirming → attestation_requested → finalized → proof_fetched → execution_submitted → minted`

Every transition is checkpointed before the next external side effect. Restarts
resume from the latest checkpoint, and submitted Flare transactions are
recovered by hash rather than blindly resubmitted.

The JSON store requires one executor instance and persistent disk. PostgreSQL is
required before horizontal scaling.
