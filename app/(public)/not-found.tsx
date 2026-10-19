import { NotFoundContent } from "@/components/site/NotFoundContent";

/** notFound() inside the public site (e.g. an unpublished expert slug):
 * rendered inside the public header and footer. */
export default function PublicNotFound() {
  return <NotFoundContent />;
}
