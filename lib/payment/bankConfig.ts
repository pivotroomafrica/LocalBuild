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
 * (not source) so a deployment can change them without a code change.
 * The defaults below are Pivotroom's real account.
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
  // Pivotroom's real receiving account (2026-10-27). The env vars can
  // override it per deployment; the account name stays hidden until one
  // is set, rather than showing a made-up holder.
  return {
    bankName: process.env.PIVOTROOM_BANK_NAME || "Commercial Bank of Ethiopia",
    accountName: process.env.PIVOTROOM_BANK_ACCOUNT_NAME || "",
    accountNumber: process.env.PIVOTROOM_BANK_ACCOUNT_NUMBER || "1000578665424",
    instructions: process.env.PIVOTROOM_BANK_INSTRUCTIONS || DEFAULT_INSTRUCTIONS,
  };
}
