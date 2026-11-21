import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { vapidDetails } from "./config";

export type PushMessage = {
  title: string;
  body: string;
  /** Opened when the notification is tapped (a path on this site). */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
};

/**
 * Sends a push notification to every device the user turned
 * notifications on for (071). Best effort: never throws, so an email job
 * or action never fails because of it. Subscriptions the push service
 * reports as gone (404/410) are removed.
 */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<number> {
  const vapid = vapidDetails();
  if (!vapid || !userId) return 0;
  try {
    const supabase = createServiceRoleClient();
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (!subs || subs.length === 0) return 0;

    const payload = JSON.stringify({
      title: message.title.slice(0, 120),
      body: message.body.slice(0, 300),
      url: message.url.startsWith("/") ? message.url : "/",
      tag: message.tag,
    });
    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { vapidDetails: vapid, TTL: 60 * 60 * 24, urgency: "high" },
          );
          sent += 1;
          await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", sub.id);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          } else {
            console.error("push: send failed", status ?? (error instanceof Error ? error.message : error));
          }
        }
      }),
    );
    return sent;
  } catch (error) {
    console.error("push:", error instanceof Error ? error.message : error);
    return 0;
  }
}
