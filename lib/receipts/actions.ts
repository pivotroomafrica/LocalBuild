"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminForAction } from "@/lib/admin/data";
import { notifyAdminsReceiptRequested, notifyCustomerReceiptIssued } from "@/lib/notify/account";

export type ReceiptActionState = { error?: string; success?: boolean };

const MAX_FILE_BYTES = 5 * 1024 * 1024; // matches the issued-receipts bucket limit
const FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Client: ask for a receipt for one of their paid bookings. */
export async function requestReceiptAction(_prev: ReceiptActionState, formData: FormData): Promise<ReceiptActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const reference = String(formData.get("booking_reference") ?? "");
  const receiptName = String(formData.get("receipt_name") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const tin = String(formData.get("tin") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (receiptName.length < 2 || receiptName.length > 160) {
    return { error: "Enter the name or company the receipt should be made out to." };
  }
  if (tin && !/^[A-Za-z0-9-]{4,20}$/.test(tin)) return { error: "Check the TIN: letters and numbers only." };
  if (note && note.length > 500) return { error: "Keep the note under 500 characters." };

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_status")
    .eq("booking_reference", reference)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (!booking || !["confirmed", "completed"].includes(booking.booking_status)) {
    return { error: "A receipt can be requested once the booking is paid." };
  }

  const { data: created, error } = await supabase
    .from("receipt_requests")
    .insert({ booking_id: booking.id, customer_id: user.id, receipt_name: receiptName, tin, note })
    .select("id")
    .single();
  if (error) {
    return {
      error: error.code === "23505" ? "You've already asked for a receipt for this booking." : "Couldn't send the request. Try again.",
    };
  }

  notifyAdminsReceiptRequested(reference, receiptName, created.id);
  revalidatePath(`/dashboard/sessions/${reference}`);
  revalidatePath("/admin/receipts");
  return { success: true };
}

/** Admin: attach the receipt (optional) and mark the request sent. */
export async function issueReceiptAction(_prev: ReceiptActionState, formData: FormData): Promise<ReceiptActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  const { data: request } = await supabase
    .from("receipt_requests")
    .select("id, booking_id, customer_id, status, bookings!receipt_requests_booking_id_fkey(booking_reference)")
    .eq("id", id)
    .maybeSingle();
  if (!request) return { error: "Request not found." };
  if (request.status === "issued") return { error: "This receipt is already marked as sent." };

  let filePath: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const ext = FILE_TYPES[file.type];
    if (!ext) return { error: "Upload a PDF or an image (JPG, PNG, WebP)." };
    if (file.size > MAX_FILE_BYTES) return { error: "The file must be 5 MB or smaller." };
    filePath = `${request.booking_id}/${Date.now()}-receipt.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("issued-receipts")
      .upload(filePath, file, { contentType: file.type, upsert: false });
    if (uploadError) return { error: "Couldn't upload the file. Try again." };
  }

  const { error } = await supabase
    .from("receipt_requests")
    .update({ status: "issued", issued_at: new Date().toISOString(), issued_by: auth.admin.id, file_path: filePath })
    .eq("id", id)
    .eq("status", "requested");
  if (error) return { error: "Couldn't save. Try again." };

  const reference = (request.bookings as { booking_reference: string } | null)?.booking_reference ?? "";
  notifyCustomerReceiptIssued(request.customer_id, reference, request.id, filePath != null);
  revalidatePath("/admin/receipts");
  revalidatePath(`/dashboard/sessions/${reference}`);
  return { success: true };
}
