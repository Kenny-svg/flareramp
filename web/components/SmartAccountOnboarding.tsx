"use client";

import { useState } from "react";
import {
  getMasterAccountControllerAddress,
  getPublicClient,
  MASTER_ACCOUNT_CONTROLLER_ABI,
} from "@/lib/contracts";
import {
  encodeFirelightDeposit,
  encodeFxrpRedeem,
  encodeFxrpTransfer,
  encodeUpshiftDeposit,
} from "@/lib/smartAccountInstructions";

type ActionType = "transfer" | "redeem" | "firelightDeposit" | "upshiftDeposit";

/**
 * Experimental Smart Accounts scaffold. Not part of the hackathon UI.
 *
 * A user with only an XRPL wallet — no FLR, no MetaMask — builds a Smart
 * Accounts instruction here and gets back the exact XRPL payment (destination
 * + memo) to send. Signing itself isn't wired to a wallet yet (needs Xaman
 * OAuth2/PKCE or similar); this produces the transaction JSON for the user to
 * sign in their own XRPL wallet, or to hand to `executor/` for automated
 * relaying in a test environment.
 *
 * `instructionFee` is a placeholder — replace with a real
 * `getInstructionFee` / operator fee-schedule read before using this for
 * anything beyond local testing.
 */
export function SmartAccountOnboarding() {
  const [xrplAddress, setXrplAddress] = useState("");
  const [action, setAction] = useState<ActionType>("transfer");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [vaultId, setVaultId] = useState("1");
  const [result, setResult] = useState<{
    personalAccount: `0x${string}`;
    nonce: bigint;
    operatorAddress: string;
    instructionHex: `0x${string}`;
    paymentTxJson: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buildPayment() {
    setError(null);
    setResult(null);
    try {
      const client = getPublicClient("coston2");
      const masterAccountController = await getMasterAccountControllerAddress("coston2");

      const [personalAccount, operatorWallets] = await Promise.all([
        client.readContract({
          address: masterAccountController,
          abi: MASTER_ACCOUNT_CONTROLLER_ABI,
          functionName: "getPersonalAccount",
          args: [xrplAddress],
        }),
        client.readContract({
          address: masterAccountController,
          abi: MASTER_ACCOUNT_CONTROLLER_ABI,
          functionName: "getXrplProviderWallets",
        }),
      ]);

      const nonce = await client.readContract({
        address: masterAccountController,
        abi: MASTER_ACCOUNT_CONTROLLER_ABI,
        functionName: "getNonce",
        args: [personalAccount],
      });

      const amountValue = BigInt(amount || "0");
      let instructionHex: `0x${string}`;
      switch (action) {
        case "transfer":
          instructionHex = encodeFxrpTransfer({
            recipientAddress: recipient as `0x${string}`,
            amountFxrp: amountValue,
          });
          break;
        case "redeem":
          instructionHex = encodeFxrpRedeem({ lots: amountValue });
          break;
        case "firelightDeposit":
          instructionHex = encodeFirelightDeposit({
            amountFxrp: amountValue,
            vaultId: Number(vaultId),
          });
          break;
        case "upshiftDeposit":
          instructionHex = encodeUpshiftDeposit({
            amountFxrp: amountValue,
            vaultId: Number(vaultId),
          });
          break;
      }

      const operatorAddress = operatorWallets[0];
      if (!operatorAddress) {
        throw new Error("No operator XRPL wallet returned — check MasterAccountController config");
      }

      // TODO: replace this placeholder with a real getInstructionFee() /
      // operator fee-schedule read before using this for anything beyond
      // local testing against a testnet operator.
      const placeholderInstructionFeeDrops = "1000000"; // 1 XRP

      const paymentTx = {
        TransactionType: "Payment",
        Destination: operatorAddress,
        Amount: placeholderInstructionFeeDrops,
        Memos: [{ Memo: { MemoData: instructionHex.slice(2) } }],
      };

      setResult({
        personalAccount,
        nonce,
        operatorAddress,
        instructionHex,
        paymentTxJson: JSON.stringify(paymentTx, null, 2),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section>
      <h2>Experimental Smart Accounts actions</h2>
      <p>Not part of the hackathon submission or supported mint flow.</p>

      <label>
        XRPL address
        <input value={xrplAddress} onChange={(e) => setXrplAddress(e.target.value)} placeholder="rXXXXXXX..." />
      </label>

      <label>
        Action
        <select value={action} onChange={(e) => setAction(e.target.value as ActionType)}>
          <option value="transfer">Transfer FXRP</option>
          <option value="redeem">Redeem FXRP → XRP</option>
          <option value="firelightDeposit">Deposit to Firelight (stXRP)</option>
          <option value="upshiftDeposit">Deposit to Upshift</option>
        </select>
      </label>

      {action === "transfer" && (
        <label>
          Recipient (Flare address)
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." />
        </label>
      )}

      {(action === "firelightDeposit" || action === "upshiftDeposit") && (
        <label>
          Vault ID
          <input value={vaultId} onChange={(e) => setVaultId(e.target.value)} />
        </label>
      )}

      <label>
        Amount {action === "redeem" ? "(lots)" : "(FXRP)"}
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10" />
      </label>

      {action === "redeem" && (
        <p>
          Redemptions are processed FIFO from the front of the queue — you can&apos;t choose which
          agent pays you out. This is a protocol rule, not a FlareRamp limitation.
        </p>
      )}

      <button onClick={buildPayment} disabled={!xrplAddress}>
        Build XRPL payment
      </button>

      {error && <p role="alert">{error}</p>}

      {result && (
        <div>
          <p>Personal account: {result.personalAccount}</p>
          <p>Current nonce: {result.nonce.toString()}</p>
          <p>Instruction: {result.instructionHex}</p>
          <p>Sign and send this Payment from your XRPL wallet:</p>
          <pre>{result.paymentTxJson}</pre>
        </div>
      )}
    </section>
  );
}
