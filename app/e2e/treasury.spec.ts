import { test, expect, Page } from "@playwright/test";

async function mockWalletConnection(page: Page) {
  await page.addInitScript(() => {
    (window as any).__MOCK_WALLET__ = {
      connected: true,
      publicKey: "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
    };
  });
}

async function mockTreasuryClient(page: Page, options: { 
  threshold?: number, 
  owners?: string[],
  spentThisPeriod?: string,
  maxAmount?: string,
  pendingTxs?: any[]
} = {}) {
  const threshold = options.threshold ?? 2;
  const owners = options.owners ?? [
    "GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
    "GOWNER22222222222222222222222222222222222222"
  ];
  const spentThisPeriod = options.spentThisPeriod ?? "20000000";
  const maxAmount = options.maxAmount ?? "100000000";
  const pendingTxs = options.pendingTxs ?? [
    {
      id: 1,
      proposer: "GOWNER22222222222222222222222222222222222222",
      target: "CTARGET1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
      fnName: "transfer",
      approvals: 1,
      executed: false,
      cancelled: false,
      dataHex: "000000030000000c000000000000002d4754455354313233343536373839304142434445464748494a4b4c4d4e4f505152535455565758595a31323334350000000c000000000000002d4754455354313233343536373839304142434445464748494a4b4c4d4e4f505152535455565758595a31323334350000000700000000000000000000000005f5e100",
    }
  ];

  await page.addInitScript(({ threshold, owners, spentThisPeriod, maxAmount, pendingTxs }) => {
    (window as any).__MOCK_TREASURY_CLIENT__ = {
      networkPassphrase: "Test SDF Network ; September 2015",
      txCount: async () => pendingTxs.length,
      threshold: async () => threshold,
      getThreshold: async () => threshold,
      getOwners: async () => owners,
      isOwner: async () => true,
      isTreasuryOwner: async () => true,
      getTx: async (viewer: string, id: number) => {
        const tx = pendingTxs.find((t: any) => t.id === id);
        if (!tx || tx.executed || tx.cancelled) return null;
        return {
          id: BigInt(tx.id),
          proposer: tx.proposer,
          target: tx.target,
          fnName: tx.fnName,
          approvals: tx.approvals,
          executed: tx.executed,
          cancelled: tx.cancelled,
          dataHex: tx.dataHex
        };
      },
      hasApproved: async () => false,
      getSpendingCap: async () => ({
        token: "CTOKEN1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
        maxAmount: BigInt(maxAmount),
        periodLedgers: 100
      }),
      getSpentThisPeriod: async () => BigInt(spentThisPeriod),
      submit: async (signerPublicKey: string, target: string, fnName: string, data: Uint8Array) => {
        const newId = pendingTxs.length + 1;
        pendingTxs.push({
          id: newId,
          proposer: signerPublicKey,
          target,
          fnName,
          approvals: 1,
          executed: false,
          cancelled: false,
          dataHex: Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')
        });
        return BigInt(newId);
      },
      approve: async (signerPublicKey: string, txId: number) => {
        const tx = pendingTxs.find((t: any) => t.id === txId);
        if (tx) {
          tx.approvals += 1;
          if (tx.approvals >= threshold) {
            tx.executed = true;
          }
        }
      },
      cancel: async (signerPublicKey: string, txId: number) => {
        const tx = pendingTxs.find((t: any) => t.id === txId);
        if (tx) {
          tx.cancelled = true;
        }
      }
    };
  }, { threshold, owners, spentThisPeriod, maxAmount, pendingTxs });
}

test.describe("Treasury E2E Operations", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept Horizon requests for balance queries to prevent actual network calls
    await page.route("**/accounts/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          balances: [
            { asset_type: "native", balance: "100.0000000" },
            {
              asset_type: "credit_alphanum4",
              asset_code: "USDC",
              asset_issuer: "GUSDC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
              balance: "5000.1234567",
            }
          ]
        })
      });
    });
  });

  test("View Treasury Balances", async ({ page }) => {
    await mockWalletConnection(page);
    await mockTreasuryClient(page);
    await page.goto("/treasury");
    
    // Check main title
    await expect(page.locator("h1")).toContainText("Treasury");

    // Check balances
    await expect(page.locator('[data-testid="usdc-balance"]')).toContainText("5000.1234567 USDC");
    await expect(page.locator('[data-testid="xlm-balance"]')).toContainText("100.0000000 XLM");
  });

  test("Submit Transfer via Quick Transfer", async ({ page }) => {
    await mockWalletConnection(page);
    await mockTreasuryClient(page);
    await page.goto("/treasury");

    // Form inputs
    const recipientInput = page.locator('[data-testid="transfer-recipient"]');
    const amountInput = page.locator('[data-testid="transfer-amount"]');
    const submitBtn = page.locator('[data-testid="submit-transfer"]');

    await expect(recipientInput).toBeVisible();
    await expect(amountInput).toBeVisible();

    // Fill the quick transfer form
    await recipientInput.fill("GRECIPIENT1234567890ABCDEFGHIJKLMNOPQRSTUVWX");
    await amountInput.fill("15.5");
    await submitBtn.click();

    // Verify it creates a new pending item in the list
    const pendingTransfers = page.locator('[data-testid="pending-transfers"]');
    await expect(pendingTransfers).toContainText("GRECIPIENT1234567890ABCDEFGHIJKLMNOPQRSTUVWX");
  });

  test("Approve Transfer and execute", async ({ page }) => {
    await mockWalletConnection(page);
    // Threshold is 2, approvals is 1. One more approval executes it (removes it from pending list)
    await mockTreasuryClient(page, { threshold: 2 });
    await page.goto("/treasury");

    const pendingTransfers = page.locator('[data-testid="pending-transfers"]');
    await expect(pendingTransfers).toContainText("Transfer 100 to GTEST123…345");

    // Click Approve button
    const approveBtn = page.getByRole("button", { name: "Approve" }).first();
    await approveBtn.click();

    // Since the threshold is reached, transaction is executed and removed from active pending list
    await expect(pendingTransfers).not.toContainText("Transfer 100 to GTEST123…345");
  });

  test("Reject Transfer", async ({ page }) => {
    await mockWalletConnection(page);
    await mockTreasuryClient(page);
    await page.goto("/treasury");

    const pendingTransfers = page.locator('[data-testid="pending-transfers"]');
    await expect(pendingTransfers).toContainText("Transfer 100 to GTEST123…345");

    // Click Reject button
    const rejectBtn = page.locator('[data-testid="reject-btn"]').first();
    await rejectBtn.click();

    // Transaction is cancelled and removed from active pending list
    await expect(pendingTransfers).not.toContainText("Transfer 100 to GTEST123…345");
  });

  test("Over-Limit Rejection", async ({ page }) => {
    await mockWalletConnection(page);
    // Cap is 50.0 USDC (500,000,000 base units), spent this period is 40.0 USDC (400,000,000)
    await mockTreasuryClient(page, { 
      maxAmount: "500000000", 
      spentThisPeriod: "400000000" 
    });
    await page.goto("/treasury");

    // Fill form with 15.0 USDC (exceeds cap since 40 + 15 = 55 > 50)
    const recipientInput = page.locator('[data-testid="transfer-recipient"]');
    const amountInput = page.locator('[data-testid="transfer-amount"]');
    const submitBtn = page.locator('[data-testid="submit-transfer"]');

    await recipientInput.fill("GRECIPIENT1234567890ABCDEFGHIJKLMNOPQRSTUVWX");
    await amountInput.fill("15.0");
    
    // Click submit, should block and display over-limit validation warning
    await submitBtn.click();
    
    const limitError = page.locator('[data-testid="limit-error"]');
    await expect(limitError).toBeVisible();
    await expect(limitError).toContainText("Transaction exceeds the configured daily spending cap.");
  });
});
