# FlareRamp

FlareRamp is a testnet-first, non-custodial XRP ↔ FXRP ramp for Flare Summer
Signal. It guides verified Core Vault minting and Coston2 redemptions:

**Check → Choose destination → Sign in Xaman → Prove with FDC → Mint FXRP**

Optional destinations after mint: Coston2 wallet, Firelight vault, or Upshift
vault (Smart Accounts `0xFE` mint-and-deposit). Reverse path: MetaMask
`redeemAmount` / `redeemWithTag` on Coston2.

## What is implemented

- Protocol-derived Core Vault destination, fees, FTSO XRP/USD quote and memo.
- Destination chooser with live vault TVL and a Firelight/Upshift details modal.
- User-controlled Xaman signing; no XRPL seed or private key enters FlareRamp.
- Durable operator executor with XRPL watching, FDC `XRPPayment` proofs,
  idempotent recovery, `executeDirectMinting` and `executeDirectMintingWithData`.
- Live stage progress, final FXRP balance and shareable public Proof Receipts,
  plus a no-wallet `/receipt` index of every settled mint.
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
npm ci
cp executor/.env.example executor/.env
cp web/.env.example web/.env.local
cp contracts/.env.example contracts/.env
```

Fill the server-only values, then run two terminals:

```bash
npm run dev:executor
npm run dev
```

The web app is at `http://localhost:3000`; executor health is at
`http://localhost:3001/ready`.

## Validation

```bash
npm run ci
npm run test:e2e
```

See [FlareRamp.md](./FlareRamp.md) for the concise submission narrative and
[`docs/`](./docs) for operational details.
