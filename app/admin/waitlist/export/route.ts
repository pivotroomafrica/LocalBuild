import { createClient } from "@/lib/supabase/server";
import { requireAdminForAction } from "@/lib/admin/data";

/** Admin: the whole waitlist as a CSV file (opens in Excel / Sheets). */
export async function GET() {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return new Response("Not found", { status: 404 });

  const { data, error } = await supabase
    .from("waitlist_signups")
    .select("full_name, email, phone, country, city, interest, created_at")
    .order("created_at", { ascending: true });
  if (error) return new Response("Could not load the waitlist.", { status: 500 });

  // Quote every cell; a leading = + - @ is neutralised so a spreadsheet
  // never runs it as a formula.
  const cell = (value: string | null) => {
    const text = (value ?? "").replace(/"/g, '""');
    return `"${/^[=+\-@]/.test(text) ? `'${text}` : text}"`;
  };
  const lines = [
    ["Name", "Email", "Phone", "Country", "City", "Wants help with", "Joined"].map(cell).join(","),
    ...(data ?? []).map((row) =>
      [row.full_name, row.email, row.phone, row.country, row.city, row.interest, row.created_at].map(cell).join(","),
    ),
  ];
  const date = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pivotroom-waitlist-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
