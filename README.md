# FlareRamp

FlareRamp is a testnet-first, non-custodial XRP ↔ FXRP ramp for Flare Summer
Signal. It guides verified Core Vault minting and Coston2 redemptions:

**Check → Choose destination → Sign in Xaman → Prove with FDC → Mint FXRP**

Optional destinations after mint: Coston2 wallet, Firelight vault, or Upshift
vault (Smart Accounts `0xFE` mint-and-deposit).

Reverse paths:

- **XRPL / Xaman (zero-FLR)** — Smart Account redeem (`0x02`) and vault exit
  (`0x12`/`0x13`, `0x22`/`0x23`) via operator payment → FDC `Payment` →
  `executeInstruction`
- **MetaMask** — `redeemAmount` / `redeemWithTag` for FXRP already in an EOA
  (user pays C2FLR gas)

## What is implemented

- Protocol-derived Core Vault destination, fees, FTSO XRP/USD quote and memo.
- Destination chooser with live vault TVL and a Firelight/Upshift details modal.
- User-controlled Xaman signing; no XRPL seed or private key enters FlareRamp.
- Durable operator executor with XRPL watching (Core Vault + operator wallets),
  FDC `XRPPayment` / `Payment` proofs, idempotent recovery,
  `executeDirectMinting[/WithData]` and `executeInstruction`.
- Live stage progress, final FXRP balance and shareable public Proof Receipts,
  plus a no-wallet `/receipt` index of every settled mint.
- XRPL-native Smart Account redeem / vault exit with live instruction-fee quotes.
- MetaMask FXRP → XRPL redeem: `redeemAmount` for any amount (no whole-lot
  rounding) and `redeemWithTag` for exchange and custodial destinations that
  require an XRPL destination tag, gated on `redeemWithTagSupported()`.
- Redemption agent collateral health, shown where the FIFO agent queue
  actually affects the user's next action.
- Explicitly labeled recorded replay for outages; it never submits transactions.

## Repository

```text
web/        Next.js guided mint, APIs, receipt and replay UI
executor/   XRPL watcher, FDC pipeline, Flare execution and durable store
contracts/  Read-only Hardhat contract discovery scripts
docs/       Architecture, deployment, security, demo and submission guidance
```

## Local setup

```bash
cp executor/.env.example executor/.env
cp web/.env.example web/.env
# fill Xaman + verifier keys; point EXECUTOR_STATUS_URL at the executor

npm install
npm run dev --workspace=executor
npm run dev --workspace=web
```

See `docs/DEMO.md` for the guided walkthrough and `docs/ARCHITECTURE.md` for
the mint and instruction pipelines.
