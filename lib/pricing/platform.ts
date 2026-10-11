import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Booking } from "@/types/booking";

/**
 * Platform pricing rules (V2, approved 2026-10-10), stored in the
 * single-row public.platform_settings table (migration 047b):
 *
 *   customer price = expert price + VAT (VAT added on top)
 *   commission     = commission rate x expert price (included, not added)
 *   expert payout  = expert price - commission
 *
 * The database is authoritative for what is CHARGED: each booking
 * snapshots its own breakdown at creation (047c) and payments charge
 * bookings.total_price (047d). These helpers only DISPLAY prices before a
 * booking exists, using the same rounding as Postgres round(x, 2).
 */
export type PlatformPricing = {
  vatRate: number;
  commissionRate: number;
  manualVerificationThreshold: number;
  currency: string;
};

type TypedClient = SupabaseClient<Database>;

export async function fetchPlatformPricing(supabase: TypedClient): Promise<PlatformPricing> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("vat_rate, commission_rate, manual_verification_threshold, currency")
    .eq("id", true)
    .single();
  if (error || !data) throw new Error(`failed to load platform_settings: ${error?.message ?? "no row"}`);
  return {
    vatRate: Number(data.vat_rate),
    commissionRate: Number(data.commission_rate),
    manualVerificationThreshold: Number(data.manual_verification_threshold),
    currency: data.currency,
  };
}

/** amount x rate, rounded to cents half away from zero (same as Postgres
 * round(numeric, 2) for the positive amounts used here). Works in integer
 * cents and basis points so no floating-point drift reaches the result. */
function percentOf(amount: number, rate: number): number {
  const cents = Math.round(amount * 100);
  const basisPoints = Math.round(rate * 10000);
  return Math.round((cents * basisPoints) / 10000) / 100;
}

/** VAT-inclusive price the customer pays for an expert price. */
export function customerPrice(expertPrice: number, vatRate: number): number {
  return Math.round((expertPrice + percentOf(expertPrice, vatRate)) * 100) / 100;
}

export function expertPayout(expertPrice: number, commissionRate: number): number {
  return Math.round((expertPrice - percentOf(expertPrice, commissionRate)) * 100) / 100;
}

/** What this booking charges. Bookings created before migration 047 have
 * no total_price and were charged their base_price. */
export function bookingChargeAmount(booking: Pick<Booking, "total_price" | "base_price">): number {
  return Number(booking.total_price ?? booking.base_price);
}

export function formatVatRate(rate: number): string {
  return `${Math.round(rate * 10000) / 100}%`;
}
