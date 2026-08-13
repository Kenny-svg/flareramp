# Submission checklist

- [ ] Public repository URL added.
- [ ] Deployed web URL added.
- [ ] Executor `/ready` monitored privately.
- [ ] Xaman credentials and executor key stored as secrets.
- [ ] Persistent executor volume configured.
- [ ] `npm run ci` passes at the submitted commit.
- [ ] Playwright primary flow and failure tests pass.
- [ ] Live Coston2 demo completed after deployment.
- [ ] Public XRPL payment and Coston2 settlement links included.
- [ ] Proof Receipt share URL included.
- [ ] Recorded replay enabled and clearly labeled.
- [ ] Demo video distinguishes live execution from recorded replay.
- [ ] README claims match the deployed interface.
- [ ] XRPL-native Smart Account redeem / vault exit demoed (or clearly labeled
      if environment lacks operator wallet liquidity).

## Public repository instructions

Clone, run `npm ci`, copy the example environment files, then follow
[`DEPLOYMENT.md`](./DEPLOYMENT.md). Live integration requires user-owned Xaman
credentials, an XRPL Testnet account, a funded Coston2 executor account and FDC
verifier/DA Layer access.

## Deployed URLs

- Web: `TODO`
- Proof Receipt: `TODO`
- Repository: `TODO`
- Demo video: `TODO`

The executor status URL should remain private and is intentionally omitted.
