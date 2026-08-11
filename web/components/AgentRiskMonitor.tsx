"use client";

/**
 * Agent Collateral / Risk Monitor.
 *
 * NOT YET WIRED UP. `AssetManager.getAgentInfo(agentVault)` and
 * `getAvailableAgentsDetailedList(start, end)` both return multi-field
 * structs whose exact layout isn't safe to hand-write (see
 * contracts/scripts/get-fassets-overview.ts for the same issue with
 * getSettings()). Decoding a guessed/partial struct ABI can silently produce
 * plausible-looking wrong collateral ratios — actively dangerous for a
 * "trust transparency" feature, so this is left as a stub rather than faked.
 *
 * To implement: pull the real IAssetManager ABI from
 * @flarenetwork/flare-wagmi-periphery-package, call
 * getAvailableAgentsDetailedList to list agents backing FXRP, then
 * getAgentInfo(agentVault) per agent for collateral ratio vs. the backing
 * factor minimum. Reference: dev.flare.network/fassets/reference/IAssetManager
 */
export function AgentRiskMonitor() {
  return (
    <section>
      <h2>Agent Collateral / Risk Monitor</h2>
      <p style={{ color: "darkorange" }}>
        Not implemented yet — needs the typed IAssetManager ABI for
        getAgentInfo/getAvailableAgentsDetailedList. See the component file
        header.
      </p>
    </section>
  );
}
