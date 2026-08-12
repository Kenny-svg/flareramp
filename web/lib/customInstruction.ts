import {
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { iPersonalAccountAbi } from "@flarenetwork/flare-wagmi-periphery-package/contracts/coston2";
import {
  ERC20_APPROVE_ABI,
  FIRELIGHT_VAULT_ABI,
  UPSHIFT_VAULT_ABI,
} from "./vaultContracts";

export interface PersonalAccountCall {
  target: Address;
  value: bigint;
  data: Hex;
}

/**
 * ERC-4337 v0.7 PackedUserOperation as used by Flare Smart Accounts
 * (`flare-viem-starter` / `@flarenetwork/smart-accounts-encoder`).
 * Only sender, nonce, and callData are validated on-chain.
 */
export interface FlarePackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const PACKED_USER_OPERATION_TUPLE = {
  type: "tuple",
  components: [
    { name: "sender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "initCode", type: "bytes" },
    { name: "callData", type: "bytes" },
    { name: "accountGasLimits", type: "bytes32" },
    { name: "preVerificationGas", type: "uint256" },
    { name: "gasFees", type: "bytes32" },
    { name: "paymasterAndData", type: "bytes" },
    { name: "signature", type: "bytes" },
  ],
} as const;

export function buildExecuteUserOpCallData(calls: PersonalAccountCall[]): Hex {
  return encodeFunctionData({
    abi: iPersonalAccountAbi,
    functionName: "executeUserOp",
    args: [calls],
  });
}

export function buildPackedUserOperation(params: {
  sender: Address;
  nonce: bigint;
  calls: PersonalAccountCall[];
}): FlarePackedUserOperation {
  return {
    sender: getAddress(params.sender),
    nonce: params.nonce,
    initCode: "0x",
    callData: buildExecuteUserOpCallData(params.calls),
    accountGasLimits: ZERO_BYTES32,
    preVerificationGas: 0n,
    gasFees: ZERO_BYTES32,
    paymasterAndData: "0x",
    signature: "0x",
  };
}

export function encodePackedUserOperation(
  userOp: FlarePackedUserOperation,
): Hex {
  return encodeAbiParameters([PACKED_USER_OPERATION_TUPLE], [userOp]);
}

export function hashPackedUserOperation(userOp: FlarePackedUserOperation): Hex {
  return keccak256(encodePackedUserOperation(userOp));
}

/**
 * 42-byte Smart Accounts custom instruction memo (`0xFE`):
 * [0xFE | walletId(1) | executorFeeUBA(8 BE) | keccak256(abi.encode(userOp))(32)]
 */
export function buildFeCustomInstructionMemo(params: {
  executorFeeUBA: bigint;
  userOpHash: Hex;
  walletId?: number;
}): Hex {
  const walletId = params.walletId ?? 0;
  if (walletId < 0 || walletId > 0xff) {
    throw new Error("walletId must fit in one byte");
  }
  if (params.executorFeeUBA < 0n || params.executorFeeUBA > 0xffff_ffff_ffff_ffffn) {
    throw new Error("executorFeeUBA must fit in 8 bytes");
  }
  const hash = params.userOpHash.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("userOpHash must be a 32-byte hex value");
  }
  const fee = params.executorFeeUBA.toString(16).padStart(16, "0");
  return `0xfe${walletId.toString(16).padStart(2, "0")}${fee}${hash}` as Hex;
}

export function buildVaultDepositCalls(params: {
  protocol: "Firelight" | "Upshift";
  fxrpToken: Address;
  vault: Address;
  personalAccount: Address;
  amountUBA: bigint;
}): PersonalAccountCall[] {
  const vault = getAddress(params.vault);
  const token = getAddress(params.fxrpToken);
  const receiver = getAddress(params.personalAccount);
  const approveData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [vault, params.amountUBA],
  });
  // Both registered Coston2 vaults use ERC-4626 deposit(assets, receiver).
  const depositData = encodeFunctionData({
    abi: params.protocol === "Firelight" ? FIRELIGHT_VAULT_ABI : UPSHIFT_VAULT_ABI,
    functionName: "deposit",
    args: [params.amountUBA, receiver],
  });
  return [
    { target: token, value: 0n, data: approveData },
    { target: vault, value: 0n, data: depositData },
  ];
}
