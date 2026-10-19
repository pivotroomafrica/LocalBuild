import { MatchClient } from "@/components/site/MatchClient";

export const metadata = { title: "Get matched — Pivotroom" };

type Props = { searchParams: Promise<{ problem?: string | string[] }> };

/** `problem` arrives from the home page brief or the directory's "Match me"
 * and is matched straight away. */
export default async function MatchPage({ searchParams }: Props) {
  const { problem } = await searchParams;
  return <MatchClient initialProblem={typeof problem === "string" ? problem : ""} />;
}
