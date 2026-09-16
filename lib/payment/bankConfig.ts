/**
 * Centralized, server-only source for Pivotroom's bank-transfer details
 * (spec section 5: "Do NOT hard-code bank account information inside
 * React components"). Read from environment variables so the real
 * production values never live in the codebase -- every page that needs
 * to show these calls getBankConfig() (a Server Component or Server
 * Action), never a component that hard-codes the values itself.
 *
 * None of these are secrets -- a bank account number meant to receive
 * customer transfers is, by definition, shown to every customer on the
 * payment page -- but they still belong in environment configuration
 * (not source) so this demo project's placeholder values are never
 * mistaken for Pivotroom's real account, and so a real deployment can
 * set the real values without a code change.
 *
 * PIVOTROOM_BANK_* are intentionally NOT prefixed with NEXT_PUBLIC_:
 * they are read only in Server Components/Server Actions and rendered
 * server-side, never bundled into client JavaScript.
 */
export type BankConfig = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
};

const DEFAULT_INSTRUCTIONS =
  "Include your booking reference in the transfer description where possible.";

export function getBankConfig(): BankConfig {
  return {
    bankName: process.env.PIVOTROOM_BANK_NAME || "Commercial Bank of Ethiopia (demo)",
    accountName: process.env.PIVOTROOM_BANK_ACCOUNT_NAME || "Pivotroom Africa PLC (demo)",
    accountNumber: process.env.PIVOTROOM_BANK_ACCOUNT_NUMBER || "1000 0000 0000 (demo)",
    instructions: process.env.PIVOTROOM_BANK_INSTRUCTIONS || DEFAULT_INSTRUCTIONS,
  };
}
