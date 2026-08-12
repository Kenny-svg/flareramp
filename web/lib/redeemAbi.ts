/** Narrow ABI surface the browser uses to send redeem txs via MetaMask. */
export const REDEEM_WRITE_ABI = [
  {
    type: "function",
    name: "redeemAmount",
    stateMutability: "payable",
    inputs: [
      { name: "_amountUBA", type: "uint256" },
      { name: "_redeemerUnderlyingAddressString", type: "string" },
      { name: "_executor", type: "address" },
    ],
    outputs: [{ name: "_redeemedAmountUBA", type: "uint256" }],
  },
  {
    type: "function",
    name: "redeemWithTag",
    stateMutability: "payable",
    inputs: [
      { name: "_amountUBA", type: "uint256" },
      { name: "_redeemerUnderlyingAddressString", type: "string" },
      { name: "_executor", type: "address" },
      { name: "_destinationTag", type: "uint256" },
    ],
    outputs: [{ name: "_redeemedAmountUBA", type: "uint256" }],
  },
] as const;
