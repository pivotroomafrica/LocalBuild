import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { IssueReceiptForm } from "@/components/receipts/IssueReceiptForm";

const TZ = "Africa/Addis_Ababa";

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** Admin: receipt requests from clients, waiting first. */
export default async function AdminReceiptsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("receipt_requests")
    .select(
      `id, status, receipt_name, tin, note, requested_at, issued_at, file_path,
       bookings!receipt_requests_booking_id_fkey(booking_reference),
       profiles!receipt_requests_customer_id_fkey(full_name)`,
    )
    .order("requested_at", { ascending: false })
    .limit(200);

  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      let fileUrl: string | null = null;
      if (row.file_path) {
        const { data: signed } = await supabase.storage.from("issued-receipts").createSignedUrl(row.file_path, 60 * 60);
        fileUrl = signed?.signedUrl ?? null;
      }
      return {
        ...row,
        reference: (row.bookings as { booking_reference: string } | null)?.booking_reference ?? "—",
        client: (row.profiles as { full_name: string } | null)?.full_name ?? "Client",
        fileUrl,
      };
    }),
  );
  const waiting = rows.filter((row) => row.status === "requested");
  const sent = rows.filter((row) => row.status === "issued");

  const details = (row: (typeof rows)[number]) => (
    <div className="stack" style={{ gap: 4, minWidth: 0 }}>
      <span style={{ fontWeight: 600 }}>
        {row.receipt_name}
        {row.tin ? <span className="muted num"> · TIN {row.tin}</span> : null}
      </span>
      <span className="muted" style={{ fontSize: 14 }}>
        {row.client} · <Link href={`/admin/bookings/${row.reference}`}>{row.reference}</Link> · asked{" "}
        {when(row.requested_at)}
      </span>
      {row.note ? (
        <span style={{ fontSize: 14 }}>
          <span className="muted">Note:</span> {row.note}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="ws-h1">Receipts</h1>
        <p className="muted" style={{ margin: 0, maxWidth: "64ch" }}>
          Clients ask for a receipt from their paid session page. Prepare it, upload it here and mark it sent: the
          client gets an email and can download it from their session page.
        </p>
      </div>

      <section className="panel stack" style={{ gap: 8 }}>
        <h2 className="ws-h2">Waiting ({waiting.length})</h2>
        {waiting.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No receipt requests waiting.
          </p>
        ) : (
          <ul className="rc-list">
            {waiting.map((row) => (
              <li key={row.id} className="rc-row">
                {details(row)}
                <IssueReceiptForm id={row.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {sent.length > 0 ? (
        <section className="panel stack" style={{ gap: 8 }}>
          <h2 className="ws-h2">Sent ({sent.length})</h2>
          <ul className="rc-list">
            {sent.map((row) => (
              <li key={row.id} className="rc-row">
                {details(row)}
                <span className="muted" style={{ fontSize: 14 }}>
                  Sent {when(row.issued_at)}
                  {row.fileUrl ? (
                    <>
                      {" "}
                      ·{" "}
                      <a href={row.fileUrl} target="_blank" rel="noopener noreferrer">
                        View file
                      </a>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
