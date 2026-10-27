/** Full-width profile previews (admin and the expert's own), outside the
 * workspace shells so the profile renders exactly as on the public site. */
export default function PreviewLayout({ children }: LayoutProps<"/preview">) {
  return <div className="pr flex min-h-screen flex-col">{children}</div>;
}
