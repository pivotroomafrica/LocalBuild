import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getEmailProvider } from "@/lib/email/factory";
import { isEmailConfigured, isEmailDeliveryEnabled } from "@/lib/email/config";
import { getAppUrl } from "@/lib/jobs/config";
import { noticeEmail, type EmailContent } from "@/lib/jobs/emailTemplates";

/**
 * Account notices outside the booking lifecycle: admins hear about new
 * expert applications and bank-transfer receipts, experts hear about
 * their application's outcome. Best effort and after the response, so a
 * failed send never blocks or undoes the action that triggered it.
 */

type Recipient = { email: string; name: string | null };

async function userRecipient(userId: string): Promise<Recipient | null> {
  const supabase = createServiceRoleClient();
  const [{ data: auth }, { data: profile }] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  const email = auth.user?.email;
  return email ? { email, name: profile?.full_name ?? null } : null;
}

async function adminRecipients(): Promise<Recipient[]> {
  const supabase = createServiceRoleClient();
  const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
  const found = await Promise.all((admins ?? []).map((admin) => userRecipient(admin.id)));
  return found.filter((r): r is Recipient => r != null);
}

async function send(to: Recipient[], content: EmailContent, key: string) {
  if (!isEmailConfigured() || !isEmailDeliveryEnabled()) return;
  const provider = getEmailProvider();
  for (const recipient of to) {
    const result = await provider.send({ to: recipient.email, ...content, idempotencyKey: `${key}:${recipient.email}` });
    if (!result.ok) console.error("account notice:", key, result.error);
  }
}

function later(task: () => Promise<void>) {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error("account notice:", error instanceof Error ? error.message : error);
    }
  });
}

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || "there";

/** To every admin: an expert submitted (or resubmitted) their application. */
export function notifyAdminsApplicationSubmitted(expertProfileId: string, expertUserId: string, submittedAt: string) {
  later(async () => {
    const [expert, admins] = await Promise.all([userRecipient(expertUserId), adminRecipients()]);
    const name = expert?.name || "An expert";
    await send(
      admins,
      noticeEmail({
        subject: `New expert application: ${name}`,
        heading: "New expert application",
        paragraphs: [
          `${name} has submitted their expert application.`,
          "Review their details, choose what clients can see, then approve and publish.",
        ],
        ctaLabel: "Review application",
        ctaUrl: `${getAppUrl()}/admin/experts/${expertProfileId}`,
      }),
      `application-submitted:${expertProfileId}:${submittedAt}`,
    );
  });
}

type ExpertOutcome = "approved" | "changes_requested" | "rejected" | "published";

/** To the expert: what happened to their application or profile. */
export function notifyExpertOutcome(expertUserId: string, outcome: ExpertOutcome, message: string | null, eventKey: string) {
  later(async () => {
    const expert = await userRecipient(expertUserId);
    if (!expert) return;
    const appUrl = getAppUrl();
    const hi = `Hi ${firstName(expert.name)},`;
    const content =
      outcome === "approved"
        ? noticeEmail({
            subject: "Your Pivotroom application is approved",
            heading: "You're approved",
            paragraphs: [
              hi,
              "Our team has approved your application. We're finishing your public profile and will publish it shortly.",
              "Set the hours clients can book now, so you can take sessions from day one.",
            ],
            ctaLabel: "Set your availability",
            ctaUrl: `${appUrl}/expert/availability`,
          })
        : outcome === "published"
          ? noticeEmail({
              subject: "Your Pivotroom profile is live",
              heading: "Your profile is live",
              paragraphs: [hi, "Clients can now find and book you on Pivotroom."],
              ctaLabel: "Go to your dashboard",
              ctaUrl: `${appUrl}/expert/dashboard`,
            })
          : outcome === "changes_requested"
            ? noticeEmail({
                subject: "A few changes to your Pivotroom application",
                heading: "Please update your application",
                paragraphs: [hi, "Our team reviewed your application and asked for a few changes:", message ?? "", "Update it and resubmit when you're ready."].filter(Boolean),
                ctaLabel: "Update your application",
                ctaUrl: `${appUrl}/expert/application`,
              })
            : noticeEmail({
                subject: "Your Pivotroom application",
                heading: "About your application",
                paragraphs: [hi, "Thank you for applying. We're not able to approve your application at this time.", message ?? ""].filter(Boolean),
                ctaLabel: "View your application",
                ctaUrl: `${appUrl}/expert/application`,
              });
    await send([expert], content, `expert-${outcome}:${eventKey}`);
  });
}

/** To every admin: a bank-transfer receipt is waiting to be checked. */
export function notifyAdminsManualPayment(bookingReference: string) {
  later(async () => {
    const admins = await adminRecipients();
    await send(
      admins,
      noticeEmail({
        subject: `Bank transfer to check: ${bookingReference}`,
        heading: "Bank transfer waiting for review",
        paragraphs: [
          `A client uploaded a bank-transfer receipt for booking ${bookingReference}.`,
          "Check it against your bank account, then verify or reject it. The client's time slot is held until then.",
        ],
        ctaLabel: "Review payments",
        ctaUrl: `${getAppUrl()}/admin/payments`,
      }),
      `manual-payment:${bookingReference}:${Date.now()}`,
    );
  });
}
