/**
 * Minimal, live-verified ABIs for the vault contracts backing mint-and-deposit
 * and the Liquidity Map (lib/vaultDeployments.ts).
 *
 * Both Coston2 destinations registered with MasterAccountController use an
 * ERC-4626-style surface: `deposit(uint256 assets, address receiver)` and the
 * vault contract itself is the share token.
 */

/** ERC-4626-style reads + deposit used by Firelight and registered Upshift. */
export const FIRELIGHT_VAULT_ABI = [
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

/**
 * Same deposit ABI as Firelight for the Smart Accounts–registered Upshift
 * vault. Kept as a separate export so call sites stay readable.
 */
export const UPSHIFT_VAULT_ABI = FIRELIGHT_VAULT_ABI;

/** ERC-20 approve used inside Smart Account deposit batches. */
export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
