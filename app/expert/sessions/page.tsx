import { createClient } from "@/lib/supabase/server";
import { requireApprovedExpertPage } from "@/lib/expert/auth";
import { getExpertSessions } from "@/lib/expert/sessions";
import { ExpertOperationsNav } from "@/components/layout/ExpertOperationsNav";
import { ExpertSessionCard } from "@/components/session/ExpertSessionCard";

/** Expert Sessions (spec section 25) -- confirmed/completed sessions only
 * for this expert's own expertProfileId, enforced by an explicit filter
 * in getExpertSessions in addition to bookings_select_own_expert (039) --
 * see that function's own comment for why RLS alone isn't sufficient for
 * a dual-identity account. */
export default async function ExpertSessionsPage() {
  const supabase = await createClient();
  const { expertProfileId } = await requireApprovedExpertPage(supabase, "/expert/sessions");

  const sessions = await getExpertSessions(supabase, expertProfileId);

  return (
    <div>
      <ExpertOperationsNav current="/expert/sessions" />

      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Sessions</h1>

        {sessions.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            You don&apos;t have any confirmed sessions yet. Sessions appear here once a customer completes payment.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li key={session.bookingId}>
                <ExpertSessionCard session={session} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
