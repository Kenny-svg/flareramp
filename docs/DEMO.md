# Judge demo script

## Live path (3–5 minutes)

1. Show the four-step Check → Sign → Prove → Mint interface.
2. Enter the XRPL source, choose wallet or Firelight/Upshift destination, and
   1 TestXRP.
3. Run readiness and point out the live Core Vault, exact fees, fresh FTSO
   timestamp, memo, and FDC availability.
4. Open Xaman and verify destination, amount and memo before signing.
5. After XRPL validation, show the durable executor stage.
6. During `attestation_requested`, explain that FDC normally needs 90–180
   seconds and that the user must not resend the payment.
7. Show the Coston2 settlement, final FXRP balance and shareable Proof Receipt.

## Zero-FLR reverse path

1. Open **Coston2 FXRP → XRPL** and keep **XRPL / Xaman (zero-FLR)** selected.
2. Choose Redeem (or a vault exit), enter the XRPL source that owns the Personal
   Account, and check the live instruction fee (not a placeholder).
3. Sign the operator payment in Xaman (no destination tag).
4. Show Prove → `instruction_executed` and the Proof Receipt for
   `executeInstruction`.
5. Optionally show MetaMask redeem as the EOA fallback (requires C2FLR).

## Failure branch

Show that a failed readiness check disables signing. Explain that rejected or
expired Xaman requests move to a terminal state without submitting a payment.
Use the Proof Receipt diagnosis for delayed FDC or executor recovery.

## Outage-safe recorded path

Open `/demo/replay`. Read the banner aloud: **Recorded demo — not a live mint**.
Verify the recorded XRPL and Coston2 explorer links. Explain that this route
does not call Xaman, FDC or any transaction-submission API.

## Claims to avoid

Do not claim agent selection, Coston2 liquidity, public executors, universal
zero-FLR for every surface (EOA MetaMask redeem still needs C2FLR), one-click
yield, or swaps. Vault exit is two-phase (request → wait → claim).
