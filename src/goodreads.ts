/**
 * Scrape the book title from a Goodreads URL.
 *
 * Fetches only enough of the response to find the <title> tag,
 * then extracts the book title from it. Goodreads titles are typically:
 *   "Book Title by Author Name | Goodreads"
 *
 * Returns the "Book Title by Author Name" portion, or null on failure.
 */
export async function scrapeGoodreadsTitle(
  url: string
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        // Goodreads returns a lighter page with a simple user agent
        "User-Agent": "Mozilla/5.0 (compatible; BookClubBot/1.0)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(
        `[goodreads] Failed to fetch ${url}: ${response.status} ${response.statusText}`
      );
      return null;
    }

    // Read the body as text — Goodreads pages are big but the <title>
    // is in the first few KB of the document
    const html = await response.text();

    // Extract <title>...</title>
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleMatch) {
      console.warn(`[goodreads] No <title> found in ${url}`);
      return null;
    }

    let title = titleMatch[1].trim();

    // Clean up HTML entities
    title = title
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/");

    // Strip the " | Goodreads" suffix
    title = title.replace(/\s*\|\s*Goodreads\s*$/, "");

    return title || null;
  } catch (err) {
    console.warn(`[goodreads] Error scraping ${url}:`, err);
    return null;
  }
}
