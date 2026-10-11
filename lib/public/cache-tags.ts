/** Cache tag for all public expert data (directory, profiles, categories,
 * AI-matching candidates). Its own module so data loaders can import it
 * without pulling in next/cache server helpers they don't use. */
export const PUBLIC_EXPERTS_TAG = "public-experts";
