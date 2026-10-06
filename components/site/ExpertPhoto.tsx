/** Real expert photos are optional (unlike a mock dataset), so every image
 * slot falls back to the expert's initial in the same box. Signed storage
 * URLs expire hourly, hence a plain <img> rather than next/image caching. */
export function ExpertPhoto({
  photoUrl,
  fullName,
  className,
  lazy = false,
}: {
  photoUrl: string | null;
  fullName: string;
  className: string;
  lazy?: boolean;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires hourly.
    return <img src={photoUrl} alt={fullName} className={className} loading={lazy ? "lazy" : undefined} />;
  }
  return (
    <div
      className={`${className} flex items-center justify-center bg-[var(--bg-beige-tint)]`}
      role="img"
      aria-label={fullName}
    >
      <span className="font-bold text-[var(--text-muted)]" style={{ fontSize: "clamp(1rem, 40%, 3rem)" }}>
        {fullName.charAt(0)}
      </span>
    </div>
  );
}
