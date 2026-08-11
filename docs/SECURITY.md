# Security and limitations

- FlareRamp never asks for an XRPL seed or user private key. Xaman signs the
  reviewed payment in the user's wallet.
- The operator executor holds a testnet Coston2 key for FDC requests and
  `executeDirectMinting`. Store it in a secret manager, never in source or a
  client-visible environment variable.
- The deployment is a single-operator system, not a decentralized or public
  executor network.
- The hackathon build is XRPL Testnet/Coston2 only and has not undergone a
  production security audit.
- The current npm production tree reports advisories in the pinned Next.js,
  wallet and Flare tooling dependency chains. Breaking major-version upgrades
  require compatibility testing before any mainnet deployment.
- Core Vault payments are irreversible. Signing is blocked when deterministic
  checks fail, but users must still review the Xaman transaction.
- Rate limiting is process-local. Production multi-instance deployments should
  replace it with a shared limiter at the edge.
- The JSON job store is single-instance and must use persistent storage.
- Public receipts expose only normalized transaction evidence. Verifier API
  keys, executor keys, raw API responses and full proof payloads are excluded.
- `0xE0` is not a general direct-mint recovery method. It only applies to failed
  Smart Accounts `0xFE`/`0xFF` custom-instruction mints using
  `executeDirectMintingWithData`.

Report suspected vulnerabilities privately to the repository owner before
public disclosure.
