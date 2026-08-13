/**
 * Product-facing Smart Account action ids for XRPL-native redeem / vault exit.
 * Encoders live in smartAccountInstructions.ts.
 */

export type SmartAccountActionKind =
  | "redeem"
  | "firelightWithdraw"
  | "firelightClaim"
  | "upshiftWithdraw"
  | "upshiftClaim";

export const SMART_ACCOUNT_ACTION_IDS: Record<SmartAccountActionKind, number> =
  {
    redeem: 0x02,
    firelightWithdraw: 0x12,
    firelightClaim: 0x13,
    upshiftWithdraw: 0x22,
    upshiftClaim: 0x23,
  };

export function actionLabel(kind: SmartAccountActionKind): string {
  switch (kind) {
    case "redeem":
      return "Redeem FXRP → XRP";
    case "firelightWithdraw":
      return "Firelight withdraw request";
    case "firelightClaim":
      return "Firelight claim withdrawal";
    case "upshiftWithdraw":
      return "Upshift withdraw request";
    case "upshiftClaim":
      return "Upshift claim withdrawal";
  }
}

/** Firelight = 1, Upshift = 2 on MasterAccountController.getVaults(). */
export function vaultTypeForAction(
  kind: SmartAccountActionKind,
): 1 | 2 | null {
  if (kind === "firelightWithdraw" || kind === "firelightClaim") return 1;
  if (kind === "upshiftWithdraw" || kind === "upshiftClaim") return 2;
  return null;
}
