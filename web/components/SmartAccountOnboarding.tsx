/**
 * Retired scaffold — XRPL-native Smart Account redeem / vault exit now lives
 * in SmartAccountActions.tsx (Redeem tab → XRPL / Xaman mode).
 *
 * Kept as a no-op export so old imports fail loudly at typecheck rather than
 * silently rendering an unfinished fee-placeholder UI.
 */
export function SmartAccountOnboarding(): never {
  throw new Error(
    "SmartAccountOnboarding was replaced by SmartAccountActions on the Redeem tab",
  );
}
