"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  applyLibraryLogoAction,
  removeCompanyLogoAction,
  saveCompanyLogoAction,
  searchCompaniesAction,
} from "@/lib/expert/companyLogoActions";
import {
  COMPANY_LOGO_BUCKET,
  COMPANY_LOGO_MAX_BYTES,
  COMPANY_LOGO_TYPES,
  companyKey,
  type LibraryMatch,
} from "@/lib/expert/companyLogos";

type Props = {
  expertProfileId: string;
  /** The folder new files go in: the expert's own user id. */
  ownerUserId: string;
  companies: string[];
  /** company key -> public URL of the logo in use */
  logos: Record<string, string>;
  /** company key -> the shared library entry with exactly that name */
  matches: Record<string, LibraryMatch>;
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
 * A logo per company the expert names (current company + experience),
 * taken from the shared company library (068) where possible: a company
 * already there is one click ("Use this logo"); the library can be
 * searched for a differently-spelled name; only a company that isn't
 * there yet gets an upload, which then joins the library for everyone.
 * Not part of onboarding: experts add them afterwards, admins any time.
 */
export function CompanyLogosEditor({
  expertProfileId,
  ownerUserId,
  companies,
  logos,
  matches,
  forAdmin = false,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [searching, setSearching] = useState<string | null>(null);
  const [, startRefresh] = useTransition();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  function done(text: string) {
    setMessage({ kind: "ok", text });
    setSearching(null);
    startRefresh(() => router.refresh());
  }

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
    const slug =
      companyKey(company)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "company";
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
    done(`Logo saved for ${company}, and added to the company library.`);
  }

  async function pickLibrary(company: string, library: LibraryMatch) {
    setMessage(null);
    setBusy(company);
    const result = await applyLibraryLogoAction(expertProfileId, company, library.id);
    setBusy(null);
    if (result.error) {
      setMessage({ kind: "err", text: result.error });
      return;
    }
    done(`Using the ${library.name} logo for ${company}.`);
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
    done(`Logo removed for ${company}.`);
  }

  return (
    <section className="logos-ed">
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="logos-ed-title">Company logos</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {forAdmin
            ? "Pick each company from the shared library, or upload a logo for one that isn't there yet."
            : "Pick each company you've worked at from our library. If it isn't there yet, upload its logo once."}{" "}
          Logos show next to the role and experience on the profile.
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
            const key = companyKey(company);
            const url = logos[key];
            const match = matches[key];
            // An exact library match whose logo isn't the one in use yet.
            const offer = match && match.logoUrl !== url ? match : null;
            const working = busy === company;
            return (
              <li key={company} className="logos-ed-row">
                <div className="logos-ed-main">
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
                  <span className="logos-ed-name">
                    {company}
                    {offer ? <span className="logos-ed-hint">In the company library</span> : null}
                  </span>
                  <span className="logos-ed-actions">
                    {offer ? (
                      <button
                        type="button"
                        className="btn btn-ink md logos-ed-use"
                        disabled={busy !== null}
                        onClick={() => void pickLibrary(company, offer)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
                        <img src={offer.logoUrl} alt="" />
                        {working ? "Saving…" : "Use this logo"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-line md"
                      disabled={busy !== null}
                      aria-expanded={searching === company}
                      onClick={() => setSearching(searching === company ? null : company)}
                    >
                      {url ? "Change" : "Find logo"}
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
                </div>

                {searching === company ? (
                  <LibrarySearch
                    company={company}
                    disabled={busy !== null}
                    working={working}
                    onPick={(library) => void pickLibrary(company, library)}
                    onUpload={() => inputs.current[company]?.click()}
                  />
                ) : null}

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

/** Search the shared library by name; pick a result, or upload a new logo. */
function LibrarySearch({
  company,
  disabled,
  working,
  onPick,
  onUpload,
}: {
  company: string;
  disabled: boolean;
  working: boolean;
  onPick: (library: LibraryMatch) => void;
  onUpload: () => void;
}) {
  const [query, setQuery] = useState(company);
  const [results, setResults] = useState<LibraryMatch[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchCompaniesAction(query).then((found) => {
        if (!cancelled) setResults(found);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="logos-ed-search">
      <label className="label" htmlFor={`lib-${companyKey(company)}`}>
        Search the company library
      </label>
      <input
        id={`lib-${companyKey(company)}`}
        className="input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Type a company name"
        autoComplete="off"
      />
      {results && results.length > 0 ? (
        <ul className="logos-ed-results">
          {results.map((library) => (
            <li key={library.id}>
              <button type="button" disabled={disabled} onClick={() => onPick(library)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
                <img src={library.logoUrl} alt="" />
                <span>{library.name}</span>
                <span className="logos-ed-pick">{working ? "Saving…" : "Use"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : results ? (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          No company with that name in the library yet.
        </p>
      ) : null}
      <button type="button" className="btn btn-line md" disabled={disabled} onClick={onUpload}>
        <span className="ms" aria-hidden="true">
          upload
        </span>
        {working ? "Uploading…" : `Not listed? Upload a logo for ${company}`}
      </button>
    </div>
  );
}
