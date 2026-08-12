import { AgentRiskMonitor } from "./AgentRiskMonitor";
import { ReverseRedeem } from "./ReverseRedeem";

/**
 * Redeem surface: the FXRP → XRPL redemption flow, followed by the health of
 * the agent queue that will actually service it.
 *
 * The two are paired deliberately. Redemption tickets are assigned FIFO from
 * the agent queue, so agent collateral health is the one place agent state
 * bears directly on a user action — unlike minting, which pays the shared
 * Core Vault and never selects an agent.
 */
export function RedeemDashboard() {
  return (
    <div className="flex flex-col gap-8 pb-12">
      <ReverseRedeem />
      <div className="max-w-4xl mx-auto px-4 w-full">
        <AgentRiskMonitor />
      </div>
    </div>
  );
}
