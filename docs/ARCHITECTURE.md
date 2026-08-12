# Architecture

```text
Browser
  │  review/sign/status/receipt + redeem quote
  ▼
Next.js web server ───── Xaman API
  │                      XRPL Testnet
  │ operator status      Coston2 RPC / FTSO / vaults
  ▼
Operator executor
  ├─ XRPL Core Vault watcher
  ├─ durable JSON transaction store + userOp registry
  ├─ FDC verifier → FdcHub → Relay → DA Layer
  └─ AssetManager.executeDirectMinting[/WithData]
```

Mint destinations:

- **Wallet** — 48-byte Core Vault memo → `executeDirectMinting`
- **Firelight / Upshift** — 42-byte `0xFE` memo + off-chain PackedUserOperation →
  `executeDirectMintingWithData` (atomic mint + vault deposit)

Reverse bridge uses the browser wallet directly:

- MetaMask on Coston2 → `redeemAmount` / `redeemWithTag` (user pays C2FLR gas)

The browser only receives public transaction details and Xaman links. Xaman
credentials, verifier keys and the executor's Coston2 key remain server-side.

The executor normalizes each XRPL hash into one durable job:

`observed → confirming → attestation_requested → finalized → proof_fetched → execution_submitted → minted`

Every transition is checkpointed before the next external side effect. Restarts
resume from the latest checkpoint, and submitted Flare transactions are
recovered by hash rather than blindly resubmitted.

The JSON store requires one executor instance and persistent disk. PostgreSQL is
required before horizontal scaling.
