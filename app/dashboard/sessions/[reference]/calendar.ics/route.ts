import { createClient } from "@/lib/supabase/server";
import { getCustomerSessionDetail } from "@/lib/dashboard/data";
import { icsBody, sessionCalendarEvent } from "@/lib/booking/calendar";

/** Apple / Outlook calendar file for one of the customer's own confirmed
 * bookings. Anything else is a plain 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not found", { status: 404 });

  const detail = await getCustomerSessionDetail(supabase, user.id, reference);
  if (!detail || !["confirmed", "completed"].includes(detail.booking.booking_status)) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(icsBody(sessionCalendarEvent(detail.booking, detail.expertName)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="pivotroom-${reference}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
