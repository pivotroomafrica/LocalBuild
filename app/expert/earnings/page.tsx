import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedExpertPage } from "@/lib/expert/auth";
import { getExpertPastPaidBookings, payoutOf } from "@/lib/expert/overview";
import { formatEtb } from "@/components/site/format";
import { shortDate } from "@/lib/utils/greeting";

/** Earnings (website design): every paid session that has taken place,
 * grouped by month, with the price, Pivotroom's 20% and the expert's
 * share. Payout transfers themselves are handled by the Pivotroom team. */
export default async function ExpertEarningsPage() {
  const supabase = await createClient();
  const { expertProfileId } = await requireApprovedExpertPage(supabase, "/expert/earnings");

  const rows = await getExpertPastPaidBookings(supabase, expertProfileId);

  const months = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = new Date(row.start_at).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "Africa/Addis_Ababa",
    });
    months.set(key, [...(months.get(key) ?? []), row]);
  }
  const total = rows.reduce((sum, row) => sum + payoutOf(row), 0);

  return (
    <div className="stack" style={{ gap: 32 }}>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="ws-h1">Earnings</h1>
        <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
          Your share of every session that has taken place: the price you set, less Pivotroom&apos;s 20%. VAT is paid by
          the client on top and isn&apos;t part of your share. See the{" "}
          <Link href="/expert-terms#payouts">expert terms</Link> for how payouts work.
        </p>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="k">Total earned</span>
          <span className="v num">{formatEtb(total)}</span>
          <span className="s">
            From {rows.length} {rows.length === 1 ? "session" : "sessions"}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="notice" style={{ margin: 0 }}>
          No completed sessions yet. Your earnings appear here after each session has taken place.
        </p>
      ) : (
        Array.from(months.entries()).map(([month, monthRows]) => (
          <section key={month} className="panel stack" style={{ gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBlockEnd: 8 }}>
              <h2 className="ws-h2">{month}</h2>
              <span className="num" style={{ fontWeight: 600 }}>
                {formatEtb(monthRows.reduce((sum, row) => sum + payoutOf(row), 0))}
              </span>
            </div>
            <div className="rows">
              {monthRows.map((row) => {
                const price = Number(row.base_price);
                const share = payoutOf(row);
                return (
                  <Link key={row.id} href={`/expert/sessions/${row.booking_reference}`}>
                    <span className="muted num" style={{ fontSize: 14 }}>
                      {shortDate(row.start_at, row.expert_timezone)}
                    </span>
                    <span className="muted num" style={{ fontSize: 14 }}>
                      {row.booking_reference} · {row.duration_minutes} min · price {formatEtb(price)} · commission{" "}
                      {formatEtb(price - share)}
                    </span>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {formatEtb(share)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
