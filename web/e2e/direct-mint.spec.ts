import { expect, test, type Page } from "@playwright/test";

const transactionId = "A".repeat(64);
const review = {
  checkedAt: "2026-08-10T09:00:00.000Z",
  smartAccountRequired: false,
  path: "Core Vault direct mint",
  transaction: {
    network: "XRPL Testnet",
    sourceAddress: "raCLYHD5V22bo11FG229M4WpxTBg7x956A",
    destination: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
    amountXrp: "1",
    amountDrops: "1000000",
    recipient: "0x16c3C6fDb329098C05bc75324976f22a826F63D3",
    executorAddress: "0x3F3FFB6071aE872d7df12a6e3f94d8E082504af9",
    memoData:
      "0x464250526641002116c3c6fdb329098c05bc75324976f22a826f63d33f3ffb6071ae872d7df12a6e3f94d8e082504af9",
  },
  fees: {
    mintingFeeDrops: "100000",
    executorFeeDrops: "100000",
    expectedFxrpDrops: "800000",
    paymentUsd: "1.03",
  },
  ftso: {
    value: "1030000",
    decimals: 6,
    timestamp: "2026-08-10T09:00:00.000Z",
  },
  checks: [
    {
      id: "all_sources",
      status: "pass",
      message: "All live sources passed",
      source: "mocked deterministic test source",
      timestamp: "2026-08-10T09:00:00.000Z",
    },
  ],
};

async function mockSigning(page: Page, xamanStage = "signed") {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.route("**/api/mint/review", (route) =>
    route.fulfill({ json: review }),
  );
  await page.route("**/api/mint/sign", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: {
          review,
          signing: {
            payloadId: "11111111-1111-1111-1111-111111111111",
            deepLink: "https://xumm.app/sign/test",
            qrCode: "data:image/png;base64,iVBORw0KGgo=",
          },
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/mint/sign/*", (route) =>
    route.fulfill({
      json:
        xamanStage === "signed"
          ? {
              stage: "signed",
              payloadId: "11111111-1111-1111-1111-111111111111",
              transactionId,
              signer: review.transaction.sourceAddress,
              message: "Payment signed and validated on XRPL",
            }
          : {
              stage: xamanStage,
              payloadId: "11111111-1111-1111-1111-111111111111",
              message: `Signing request was ${xamanStage}`,
            },
    }),
  );
}

async function enterQuote(page: Page) {
  await page.goto("/");
  await page.getByLabel("XRPL source address").fill(
    review.transaction.sourceAddress,
  );
  await page.getByLabel("FXRP recipient on Coston2").fill(
    review.transaction.recipient,
  );
  await page.getByLabel("TestXRP payment amount").fill("1");
  await page.getByRole("button", { name: "Check mint readiness" }).click();
  await expect(page.getByText("Approve exactly this payment")).toBeVisible();
  await page.getByRole("button", {
    name: "Open verified payment in Xaman",
  }).click();
}

test("completes the primary Check → Sign → Prove → Mint flow", async ({
  page,
}) => {
  await mockSigning(page);
  await page.route("**/api/mint/status/*", (route) =>
    route.fulfill({
      json: {
        transactionId,
        stage: "minted",
        phase: "complete",
        message: "FXRP mint completed",
        expectedTiming: "Complete",
        executorReachable: true,
        attempts: 0,
        updatedAt: "2026-08-10T09:03:00.000Z",
        nextAttemptAt: null,
        flareTransactionHash: `0x${"b".repeat(64)}`,
        settlement: {
          flareTransactionHash: `0x${"b".repeat(64)}`,
          blockNumber: "123",
          recipient: review.transaction.recipient,
          executor: review.transaction.executorAddress,
          mintedAmountUBA: "800000",
          mintingFeeUBA: "100000",
          executorFeeUBA: "100000",
        },
        fxrpBalance: {
          recipient: review.transaction.recipient,
          balanceUBA: "800000",
          source: "FXRP balanceOf",
          timestamp: "2026-08-10T09:03:00.000Z",
        },
      },
    }),
  );

  await enterQuote(page);
  await expect(
    page.getByRole("heading", { name: "Mint complete", exact: true }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Final onchain FXRP balance:")).toBeVisible();
  await expect(page.getByText("Open shareable Proof Receipt")).toBeVisible();
});

test("explains the normal FDC wait without suggesting another payment", async ({
  page,
}) => {
  await mockSigning(page);
  await page.route("**/api/mint/status/*", (route) =>
    route.fulfill({
      json: {
        transactionId,
        stage: "attestation_requested",
        phase: "prove",
        message: "FDC providers are confirming the XRPL payment",
        expectedTiming: "Typically 90–180 seconds; keep this page open",
        executorReachable: true,
        attempts: 0,
        updatedAt: "2026-08-10T09:01:00.000Z",
        nextAttemptAt: null,
        votingRoundId: "1421340",
      },
    }),
  );

  await enterQuote(page);
  await expect(page.getByText("Why this takes 90–180 seconds")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Do not send another payment/)).toBeVisible();
});

test("handles a rejected Xaman request", async ({ page }) => {
  await mockSigning(page, "rejected");
  await enterQuote(page);
  await expect(page.getByText("Signing request was rejected")).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("button", { name: "Start a new request" }),
  ).toBeVisible();
});

test("labels outage replay as recorded and never live", async ({ page }) => {
  await page.goto("/demo/replay");
  await expect(
    page.getByText("Recorded demo — not a live mint"),
  ).toBeVisible();
  await expect(
    page.getByText(/never opens Xaman, requests a new proof, or submits/),
  ).toBeVisible();
  await expect(page.getByText("0.8 FXRP", { exact: false })).toBeVisible();
});
