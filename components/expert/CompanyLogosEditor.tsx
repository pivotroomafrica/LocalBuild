"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { removeCompanyLogoAction, saveCompanyLogoAction } from "@/lib/expert/companyLogoActions";
import {
  COMPANY_LOGO_BUCKET,
  COMPANY_LOGO_MAX_BYTES,
  COMPANY_LOGO_TYPES,
  companyKey,
} from "@/lib/expert/companyLogos";

type Props = {
  expertProfileId: string;
  /** The folder the files go in: the expert's own user id. */
  ownerUserId: string;
  companies: string[];
  /** company key -> public URL */
  logos: Record<string, string>;
  /** Wording for an admin editing someone else's profile. */
  forAdmin?: boolean;
};

/** Raster logos are shrunk before upload, so a big source file is fine. */
const SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const SVG_MAX_BYTES = 200 * 1024;
/** Logos show at 22-28px; 256px keeps them sharp on any screen. */
const LOGO_MAX_SIDE = 256;

/**
 * Resizes a PNG/JPG/WebP logo to at most 256px on its longest side and
 * re-encodes it as WebP (PNG where the browser can't make WebP), keeping
 * transparency. A logo is then roughly 5-20 KB. SVGs are already tiny and
 * pass through; if shrinking fails or doesn't help, the original is used.
 */
async function shrinkLogo(file: File): Promise<File> {
  if (file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const toBlob = (type: string, quality?: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    let blob = await toBlob("image/webp", 0.86);
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/png");
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : "png";
    return new File([blob], `logo.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/**
 * A logo per company the expert names (current company + experience).
 * Shown on the public profile next to the role and each experience row.
 * Not part of onboarding: experts add them afterwards, admins any time.
 */
export function CompanyLogosEditor({ expertProfileId, ownerUserId, companies, logos, forAdmin = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [, startRefresh] = useTransition();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(company: string, original: File) {
    setMessage(null);
    if (!COMPANY_LOGO_TYPES.includes(original.type)) {
      setMessage({ kind: "err", text: "Please choose a PNG, JPG, WebP or SVG image." });
      return;
    }
    if (original.type === "image/svg+xml" ? original.size > SVG_MAX_BYTES : original.size > SOURCE_MAX_BYTES) {
      setMessage({ kind: "err", text: "That image is too large. Please choose a smaller one." });
      return;
    }
    setBusy(company);
    // Shrunk in the browser before upload, so each logo stays tiny in storage.
    const file = await shrinkLogo(original);
    if (file.size > COMPANY_LOGO_MAX_BYTES) {
      setBusy(null);
      setMessage({ kind: "err", text: "That image is too large. Please choose a smaller one." });
      return;
    }
    setBusy(company);
    const slug = companyKey(company).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";
    const path = `${ownerUserId}/${slug}-${Date.now()}.${EXT[file.type] ?? "png"}`;
    const { error: uploadError } = await createClient()
      .storage.from(COMPANY_LOGO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setBusy(null);
      setMessage({ kind: "err", text: "The upload didn't work. Please try again." });
      return;
    }
    const result = await saveCompanyLogoAction(expertProfileId, company, path);
    setBusy(null);
    if (result.error) {
      await createClient().storage.from(COMPANY_LOGO_BUCKET).remove([path]);
      setMessage({ kind: "err", text: result.error });
      return;
    }
    setMessage({ kind: "ok", text: `Logo saved for ${company}.` });
    startRefresh(() => router.refresh());
  }

  async function remove(company: string) {
    setMessage(null);
    setBusy(company);
    const result = await removeCompanyLogoAction(expertProfileId, company);
    setBusy(null);
    if (result.error) {
      setMessage({ kind: "err", text: result.error });
      return;
    }
    setMessage({ kind: "ok", text: `Logo removed for ${company}.` });
    startRefresh(() => router.refresh());
  }

  return (
    <section className="logos-ed">
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="logos-ed-title">Company logos</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {forAdmin
            ? "Add a logo for each company on this expert's profile. They show next to their role and experience."
            : "Add the logo of each company you've worked at. They show next to your role and experience on your profile."}{" "}
          PNG, JPG, WebP or SVG. Logos are resized automatically, so they take up very little space.
        </p>
      </div>

      {companies.length === 0 ? (
        <p className="notice" style={{ margin: 0 }}>
          {forAdmin
            ? "This expert hasn't named a company yet. Add a current company or experience first."
            : "Add your current company or your experience above first, then come back to add logos."}
        </p>
      ) : (
        <ul className="logos-ed-list">
          {companies.map((company) => {
            const url = logos[companyKey(company)];
            const working = busy === company;
            return (
              <li key={company} className="logos-ed-row">
                <span className={url ? "logos-ed-img" : "logos-ed-img empty"}>
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- public storage URL
                    <img src={url} alt={`${company} logo`} />
                  ) : (
                    <span className="ms" aria-hidden="true">
                      business
                    </span>
                  )}
                </span>
                <span className="logos-ed-name">{company}</span>
                <span className="logos-ed-actions">
                  <input
                    ref={(node) => {
                      inputs.current[company] = node;
                    }}
                    type="file"
                    accept={COMPANY_LOGO_TYPES.join(",")}
                    className="sr-only"
                    aria-label={`Upload a logo for ${company}`}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void upload(company, file);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-line md"
                    disabled={busy !== null}
                    onClick={() => inputs.current[company]?.click()}
                  >
                    {working ? "Saving…" : url ? "Replace" : "Upload logo"}
                  </button>
                  {url ? (
                    <button
                      type="button"
                      className="textbtn"
                      disabled={busy !== null}
                      onClick={() => void remove(company)}
                    >
                      Remove
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {message ? (
        <p role="status" className={message.kind === "ok" ? "notice ok logos-ed-msg" : "notice err logos-ed-msg"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
