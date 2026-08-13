# Architecture

```text
Browser
  │  review/sign/status/receipt + SA / MetaMask redeem
  ▼
Next.js web server ───── Xaman API
  │                      XRPL Testnet
  │ operator status      Coston2 RPC / FTSO / vaults
  ▼
Operator executor
  ├─ XRPL Core Vault watcher (mint)
  ├─ XRPL operator-wallet watcher (Smart Account instructions)
  ├─ durable JSON transaction store + userOp registry
  ├─ FDC verifier → FdcHub → Relay → DA Layer
  ├─ AssetManager.executeDirectMinting[/WithData]
  └─ MasterAccountController.executeInstruction
```

Mint destinations:

- **Wallet** — 48-byte Core Vault memo → `executeDirectMinting`
- **Firelight / Upshift** — 42-byte `0xFE` memo + off-chain PackedUserOperation →
  `executeDirectMintingWithData` (atomic mint + vault deposit)

Reverse / exit paths:

- **XRPL Smart Account** — 32-byte CRT memo to
  `MasterAccountController.getXrplProviderWallets()[0]` → FDC `Payment` →
  `executeInstruction` (redeem `0x02`, Firelight `0x12`/`0x13`, Upshift
  `0x22`/`0x23`). Instruction fee from `getInstructionFee` /
  `getDefaultInstructionFee`. No destination tag.
- **MetaMask** — `redeemAmount` / `redeemWithTag` for EOA-held FXRP (user pays
  C2FLR gas)

The browser only receives public transaction details and Xaman links. Xaman
credentials, verifier keys and the executor's Coston2 key remain server-side.

Mint jobs:

`observed → confirming → attestation_requested → finalized → proof_fetched → execution_submitted → minted`

Instruction jobs share the FDC checkpoints and finish at `instruction_executed`.

Every transition is checkpointed before the next external side effect. Restarts
resume from the latest checkpoint, and submitted Flare transactions are
recovered by hash rather than blindly resubmitted.

The JSON store requires one executor instance and persistent disk. PostgreSQL is
required before horizontal scaling.
