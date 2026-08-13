/**
 * Flare Smart Accounts — payment reference (memo) instruction encoding.
 *
 * Every instruction is a fixed 32-byte payload carried as the XRPL payment's
 * memo/payment-reference:
 *
 *   byte 0        instruction id  (high nibble = type, low nibble = command)
 *   byte 1        wallet id       (0 if unassigned by the operator)
 *   bytes 2-11    value           (10 bytes, big-endian uint)
 *   bytes 12-31   params          (20 bytes, instruction-specific)
 *
 * Only the non-legacy instruction types are implemented here (transfer,
 * redeem, and the Firelight/Upshift deposit/redeem/claim commands). Minting
 * itself is NOT one of these — as of the current FAssets flow, minting is a
 * plain XRPL payment to the Core Vault (see FlareRamp.md "Minting Flow"),
 * not a Smart Accounts CRT instruction (0x00/0x10/0x20 below are legacy and
 * intentionally not wired up here).
 *
 * Spec source: flare-smart-accounts skill, "Instruction Types — Detailed
 * Byte Formats" section.
 */

const INSTRUCTION_LENGTH = 32;
const VALUE_BYTES = 10;
const PARAMS_BYTES = 20;

type Hex = `0x${string}`;

function toHex(bytes: Uint8Array): Hex {
  return (`0x` + Buffer.from(bytes).toString("hex")) as Hex;
}

function writeBigEndian(target: Uint8Array, offset: number, length: number, value: bigint) {
  if (value < 0n) throw new Error("value must be non-negative");
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    target[offset + i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) {
    throw new Error(`value ${value} does not fit in ${length} bytes`);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

interface BuildOptions {
  instructionId: number; // e.g. 0x01
  walletId?: number; // default 0
  value: bigint; // meaning depends on instructionId — see wrapper functions below
  /** Raw 20-byte params field. Left zero-padded if shorter. */
  params?: Uint8Array;
}

function buildInstruction({ instructionId, walletId = 0, value, params }: BuildOptions): Hex {
  if (instructionId < 0 || instructionId > 0xff) {
    throw new Error("instructionId must fit in one byte");
  }
  if (walletId < 0 || walletId > 0xff) {
    throw new Error("walletId must fit in one byte");
  }

  const bytes = new Uint8Array(INSTRUCTION_LENGTH);
  bytes[0] = instructionId;
  bytes[1] = walletId;
  writeBigEndian(bytes, 2, VALUE_BYTES, value);

  if (params) {
    if (params.length > PARAMS_BYTES) {
      throw new Error(`params must be at most ${PARAMS_BYTES} bytes`);
    }
    // Right-align within the 20-byte params field (matches the documented
    // examples, which right-align a 20-byte recipient address).
    bytes.set(params, 2 + VALUE_BYTES + (PARAMS_BYTES - params.length));
  }

  return toHex(bytes);
}

/** 0x01 — Transfer FXRP to a Flare address. `amountFxrp` is a plain integer count, per the documented example (value 10 => "10 FXRP", not scaled by token decimals). */
export function encodeFxrpTransfer(params: {
  recipientAddress: Hex;
  amountFxrp: bigint;
  walletId?: number;
}): Hex {
  const recipientBytes = hexToBytes(params.recipientAddress);
  if (recipientBytes.length !== 20) {
    throw new Error("recipientAddress must be a 20-byte 0x-prefixed address");
  }
  return buildInstruction({
    instructionId: 0x01,
    walletId: params.walletId,
    value: params.amountFxrp,
    params: recipientBytes,
  });
}

/** 0x02 — Redeem FXRP back to XRP on XRPL. `lots` is the number of FAssets lots (see AssetManager.getSettings().lotSizeAMG for lot size). */
export function encodeFxrpRedeem(params: { lots: bigint; walletId?: number }): Hex {
  return buildInstruction({ instructionId: 0x02, walletId: params.walletId, value: params.lots });
}

/** 0x11 — Deposit existing FXRP into a Firelight vault. `vaultId` occupies bytes 15-16 (i.e. the first two bytes of the params field, per the doc table). */
export function encodeFirelightDeposit(params: {
  amountFxrp: bigint;
  vaultId: number;
  walletId?: number;
}): Hex {
  return buildInstruction({
    instructionId: 0x11,
    walletId: params.walletId,
    value: params.amountFxrp,
    params: vaultIdParams(params.vaultId),
  });
}

/** 0x12 — Begin withdrawal from a Firelight vault. */
export function encodeFirelightRedeem(params: {
  amountFxrp: bigint;
  vaultId: number;
  walletId?: number;
}): Hex {
  return buildInstruction({
    instructionId: 0x12,
    walletId: params.walletId,
    value: params.amountFxrp,
    params: vaultIdParams(params.vaultId),
  });
}

/**
 * 0x13 — Claim a completed Firelight withdrawal.
 * `period` is the Firelight vault period id from the prior redeem request
 * (not an FXRP amount). See Flare FAsset instructions: claim withdraw value.
 */
export function encodeFirelightClaimWithdraw(params: {
  period: bigint;
  vaultId: number;
  walletId?: number;
}): Hex {
  return buildInstruction({
    instructionId: 0x13,
    walletId: params.walletId,
    value: params.period,
    params: vaultIdParams(params.vaultId),
  });
}

/** 0x21 — Deposit existing FXRP into an Upshift vault. */
export function encodeUpshiftDeposit(params: {
  amountFxrp: bigint;
  vaultId: number;
  walletId?: number;
}): Hex {
  return buildInstruction({
    instructionId: 0x21,
    walletId: params.walletId,
    value: params.amountFxrp,
    params: vaultIdParams(params.vaultId),
  });
}

/** 0x22 — Request withdrawal from an Upshift vault (starts the waiting period). */
export function encodeUpshiftRequestRedeem(params: {
  amountFxrp: bigint;
  vaultId: number;
  walletId?: number;
}): Hex {
  return buildInstruction({
    instructionId: 0x22,
    walletId: params.walletId,
    value: params.amountFxrp,
    params: vaultIdParams(params.vaultId),
  });
}

/** 0x23 — Claim an Upshift withdrawal after the waiting period. `date` is YYYYMMDD, e.g. 20251218. */
export function encodeUpshiftClaim(params: {
  date: number;
  vaultId: number;
  walletId?: number;
}): Hex {
  return buildInstruction({
    instructionId: 0x23,
    walletId: params.walletId,
    value: BigInt(params.date),
    params: vaultIdParams(params.vaultId),
  });
}

/**
 * Vault deposit/redeem/claim instructions place a 2-byte vaultId at bytes
 * 15-16 — i.e. the first two bytes of the 20-byte params field, per the
 * documented tables ("13-14 — Arbitrary (ignored)", "15-16 vaultId").
 */
function vaultIdParams(vaultId: number): Uint8Array {
  if (vaultId < 0 || vaultId > 0xffff) throw new Error("vaultId must fit in two bytes");
  const params = new Uint8Array(PARAMS_BYTES);
  params[2] = (vaultId >> 8) & 0xff;
  params[3] = vaultId & 0xff;
  return params;
}

/** Decodes the common header of any instruction, for debugging/inspection. Does not interpret type-specific params fields. */
export function decodeInstructionHeader(instructionHex: Hex): {
  instructionId: number;
  walletId: number;
  value: bigint;
  paramsHex: Hex;
} {
  const bytes = hexToBytes(instructionHex);
  if (bytes.length !== INSTRUCTION_LENGTH) {
    throw new Error(`instruction must be exactly ${INSTRUCTION_LENGTH} bytes`);
  }
  let value = 0n;
  for (let i = 0; i < VALUE_BYTES; i++) {
    value = (value << 8n) | BigInt(bytes[2 + i]);
  }
  return {
    instructionId: bytes[0],
    walletId: bytes[1],
    value,
    paramsHex: toHex(bytes.slice(2 + VALUE_BYTES)),
  };
}
