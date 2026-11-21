import { vapidPublicKey } from "@/lib/push/config";
import { NotificationsToggle } from "./NotificationsToggle";

/** Server wrapper: shows the toggle only when push is set up on the server. */
export function NotificationsCard() {
  const key = vapidPublicKey();
  return key ? <NotificationsToggle publicKey={key} /> : null;
}
