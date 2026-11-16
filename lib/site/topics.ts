/**
 * What each expert category covers, shown as topic chips on the home page
 * ("Explore experts by topic"). Keys are the real expert_categories names;
 * a category without a list here still shows, just without chips.
 *
 * Experts never pick topics by hand: they're worked out from each expert's
 * own profile (lib/expert/topics.ts, AI with a word-match fallback) and
 * stored on expert_profiles.topics (064). A chip opens the experts for that
 * topic, or its whole category while nobody lists it yet.
 *
 * Renaming a topic here: experts who had the old name keep it until their
 * topics are next worked out (any profile save).
 */
export const CATEGORY_TOPICS: Record<string, string[]> = {
  "Starting & Building a Business": [
    "Idea validation",
    "Business plan",
    "Business registration and licensing",
    "Choosing a legal structure",
    "Go-to-market",
    "Pricing strategy",
    "Bootstrapping",
    "First hires",
    "Mentors for first-time founders",
    "Mentors for non-technical founders",
    "Family business",
    "Franchising",
    "Social enterprise",
    "Two-sided marketplace",
  ],
  "Funding, Investment & Finance": [
    "Fundraising",
    "Pitch deck review",
    "Angel and seed investment",
    "Venture capital",
    "Grants and competitions",
    "Bank loans",
    "Valuation",
    "Financial modelling",
    "Cash flow",
    "Bookkeeping and accounting",
    "Tax and VAT",
    "Investor relations",
    "Diaspora investment",
    "Mergers and acquisitions",
  ],
  "Marketing, Brand & Growth": [
    "Growth marketing",
    "Marketing strategy review",
    "Branding",
    "Social media",
    "Content marketing",
    "Telegram and TikTok marketing",
    "SEO",
    "Paid ads",
    "Email marketing",
    "Influencer marketing",
    "PR and media",
    "Copywriting",
    "Customer research",
    "Events and activations",
  ],
  "Sales, Partnership & Expansion": [
    "Sales",
    "Building a sales team",
    "B2B sales",
    "Founder-led sales",
    "Partnerships",
    "Distribution",
    "Government and tender sales",
    "Pricing and negotiation",
    "Customer success",
    "Export",
    "Entering the Ethiopian market",
    "Expanding across Africa",
    "Retail and wholesale",
    "Moving upmarket",
  ],
  "Product, Technology & AI": [
    "Product management",
    "Product-market fit",
    "Product launch",
    "User research",
    "Design and UX",
    "Building an MVP",
    "Hiring developers",
    "Software architecture",
    "Mobile apps",
    "Fintech and payments",
    "Data and analytics",
    "AI for your business",
    "Cybersecurity",
    "No-code tools",
  ],
  "Leadership, Management & Operations": [
    "Leadership",
    "Managing a team",
    "Hiring and team-building",
    "Company culture",
    "Operations",
    "Supply chain and logistics",
    "Process and systems",
    "Performance management",
    "Board and governance",
    "Scaling a company",
    "Remote and hybrid teams",
    "Change management",
    "Crisis management",
  ],
  "Career & Professional": [
    "Career change",
    "CV and LinkedIn review",
    "Interview preparation",
    "Salary negotiation",
    "Getting promoted",
    "First management role",
    "Working abroad",
    "Scholarships and further study",
    "Public speaking",
    "Personal brand",
    "Freelancing and consulting",
    "Mentoring for women in business",
  ],
  "Industry & Specialized Expertise": [
    "Agribusiness",
    "Coffee",
    "Manufacturing",
    "Construction and real estate",
    "Hospitality and tourism",
    "Healthcare",
    "Education",
    "Banking and microfinance",
    "Import and export",
    "Energy",
    "Telecom",
    "NGOs and development",
    "Legal and compliance",
    "Creative industries",
  ],
};

/** The category a topic belongs to (null for an unknown topic). */
export function categoryOfTopic(topic: string): string | null {
  for (const [category, topics] of Object.entries(CATEGORY_TOPICS)) if (topics.includes(topic)) return category;
  return null;
}
