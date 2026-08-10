# FlareRamp

FlareRamp is a testnet-first, non-custodial XRP → FXRP ramp for Flare Summer
Signal. It guides one verified Core Vault payment through:

**Check → Sign in Xaman → Prove with FDC → Mint FXRP**

The shipped hackathon UI does not provide agent selection, Coston2 liquidity,
yield routing, public executor discovery, or universal zero-FLR Smart Accounts
actions.

## What is implemented

- Protocol-derived Core Vault destination, fees, FTSO XRP/USD quote and memo.
- User-controlled Xaman signing; no XRPL seed or private key enters FlareRamp.
- Durable operator executor with XRPL watching, FDC `XRPPayment` proofs,
  idempotent recovery and `executeDirectMinting`.
- Live stage progress, final FXRP balance and shareable public Proof Receipts.
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
