import { COSTON2_VAULT_DEPLOYMENTS } from "./vaultDeployments";

export type MintDestinationKind = "wallet" | "firelight" | "upshift";

export function isVaultDestination(
  kind: MintDestinationKind,
): kind is "firelight" | "upshift" {
  return kind === "firelight" || kind === "upshift";
}

export function vaultDeploymentFor(
  kind: "firelight" | "upshift",
): (typeof COSTON2_VAULT_DEPLOYMENTS)[number] {
  const protocol = kind === "firelight" ? "Firelight" : "Upshift";
  const found = COSTON2_VAULT_DEPLOYMENTS.find(
    (entry) => entry.protocol === protocol,
  );
  if (!found) {
    throw new Error(`No Coston2 deployment configured for ${protocol}`);
  }
  return found;
}

export function destinationLabel(kind: MintDestinationKind): string {
  switch (kind) {
    case "wallet":
      return "Bridge to your wallet";
    case "firelight":
      return "Bridge and deposit to Firelight";
    case "upshift":
      return "Bridge and deposit to Upshift";
  }
}
