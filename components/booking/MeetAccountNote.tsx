/**
 * Under a "Join Google Meet" link: which Google account to join with.
 * Pivotroom invites each person's sign-in email to the meeting, so that
 * account goes straight in; any other account waits at "Ask to join"
 * with nobody there to admit it.
 */
export function MeetAccountNote({ email }: { email: string | null | undefined }) {
  if (!email) return null;
  return (
    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900">
      Join signed in to Google as <strong className="break-all">{email}</strong>. That&apos;s the address invited to
      this meeting. With any other Google account you&apos;ll be left waiting at &ldquo;Ask to join&rdquo;. On a phone,
      switch accounts in the Meet app first.
    </p>
  );
}
