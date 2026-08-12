import { describe, expect, it } from "vitest";
import {
  destinationLabel,
  isVaultDestination,
  vaultDeploymentFor,
} from "./mintDestination";

describe("mintDestination", () => {
  it("labels destinations", () => {
    expect(destinationLabel("wallet")).toContain("wallet");
    expect(destinationLabel("firelight")).toContain("Firelight");
    expect(destinationLabel("upshift")).toContain("Upshift");
  });

  it("resolves vault deployments", () => {
    expect(isVaultDestination("wallet")).toBe(false);
    expect(vaultDeploymentFor("firelight").protocol).toBe("Firelight");
    expect(vaultDeploymentFor("upshift").vaultAddress).toMatch(/^0x/);
  });
});
