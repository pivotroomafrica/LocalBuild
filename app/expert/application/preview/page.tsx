import { redirect } from "next/navigation";

/** Moved to a full-width page outside the expert workspace. */
export default function ExpertApplicationPreviewRedirect() {
  redirect("/preview/my-profile");
}
