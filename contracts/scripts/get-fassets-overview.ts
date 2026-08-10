/**
 * Reads FAssets lot size + current XRP/USD price, for the portfolio/agent-risk
 * views to compute collateral ratios and USD values.
 *
 * NOT YET WIRED UP. `IAssetManager.getSettings()` returns a large multi-field
 * struct and `FtsoV2.getFeedById()` is a payable view with a fee-calculator
 * dependency — both are easy to decode incorrectly by hand-writing a partial
 * ABI fragment (ethers/viem will happily "decode" a truncated tuple into
 * plausible-looking wrong numbers). Don't hand-roll these.
 *
 * Instead, follow the official pattern:
 *   1. npm install --save-dev @flarenetwork/flare-wagmi-periphery-package viem
 *   2. Import the typed `coston2` namespace from that package for the real
 *      IAssetManager / FtsoV2 ABIs.
 *   3. Resolve AssetManagerFXRP via FlareContractsRegistry (see
 *      get-fxrp-address.ts for the registry call pattern).
 *   4. Call getSettings() -> read `lotSizeAMG` / `assetDecimals` by field name
 *      (not by tuple position) using the typed ABI.
 *   5. Resolve FtsoV2 via the registry, call getFeedById with the XRP/USD feed
 *      id (0x015852502f55534400000000000000000000000000), check
 *      FeeCalculator for any required msg.value.
 *
 * Full guide: https://dev.flare.network/fassets/developer-guides/fassets-settings-node
 */

async function main() {
  throw new Error(
    "Not implemented — see the file header for why this needs the typed " +
      "@flarenetwork/flare-wagmi-periphery-package ABIs instead of a hand-written one."
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
