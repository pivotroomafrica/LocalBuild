/**
 * The site's menu, shared by the desktop mega menu and the phone menu.
 * Each section has a landing page (`href`), its sub-pages (`links`) and up
 * to two picture cards shown on the right of the desktop panel.
 */
export type NavLink = { href: string; label: string };
export type NavCard = { href: string; label: string; image: string };
export type NavSection = {
  key: string;
  label: string;
  href: string;
  links: NavLink[];
  cards: NavCard[];
};

export const HOW_WE_HELP_PAGES = [
  { slug: "expert-calls", label: "Expert calls" },
  { slug: "in-person-meetings", label: "In-person meetings" },
  { slug: "finding-the-right-expert", label: "Finding the right expert" },
  { slug: "pricing-and-payments", label: "Pricing and payments" },
] as const;

/** `topics`: live expert categories, shown under Find an expert. */
export function siteNav({ topics, isApprovedExpert }: { topics: string[]; isApprovedExpert: boolean }): NavSection[] {
  return [
    {
      key: "how",
      label: "How we help",
      href: "/how-we-help",
      links: HOW_WE_HELP_PAGES.map((page) => ({ href: `/how-we-help/${page.slug}`, label: page.label })),
      cards: [
        { href: "/how-we-help/expert-calls", label: "Expert calls", image: "/images/how-1.svg" },
        { href: "/how-we-help/in-person-meetings", label: "In-person meetings", image: "/images/how-4.svg" },
      ],
    },
    {
      key: "find",
      label: "Find an expert",
      href: "/experts",
      links: [
        { href: "/experts", label: "All experts" },
        ...topics.slice(0, 6).map((topic) => ({ href: `/experts?category=${encodeURIComponent(topic)}`, label: topic })),
      ],
      cards: [
        { href: "/experts", label: "Browse every expert", image: "/images/how-2.svg" },
        { href: "/how-we-help/finding-the-right-expert", label: "How to choose well", image: "/images/how-1.svg" },
      ],
    },
    {
      key: "experts",
      label: "For experts",
      href: "/become-an-expert",
      links: [
        isApprovedExpert
          ? { href: "/expert/dashboard", label: "Expert dashboard" }
          : { href: "/become-an-expert", label: "Become an expert" },
        { href: "/become-an-expert#terms", label: "How it works for experts" },
        { href: "/expert-terms", label: "Expert terms" },
      ],
      cards: [{ href: "/become-an-expert", label: "Apply to be an expert", image: "/images/how-4.svg" }],
    },
    {
      key: "about",
      label: "About us",
      href: "/about",
      links: [
        { href: "/about", label: "About Pivotroom" },
        { href: "/help", label: "Help and FAQ" },
        { href: "/contact", label: "Contact us" },
      ],
      cards: [
        { href: "/help", label: "Help and FAQ", image: "/images/how-1.svg" },
        { href: "/contact", label: "Contact us", image: "/images/about-map.svg" },
      ],
    },
  ];
}
