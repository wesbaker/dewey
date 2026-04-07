export interface BookSourceLink {
  label: string;
  url: string;
}

export function buildBookSourceLinks(params: {
  bookUrl?: string;
  bookTitle?: string;
}): BookSourceLink[] {
  const links: BookSourceLink[] = [];

  if (params.bookUrl) {
    links.push({
      label: "Goodreads",
      url: params.bookUrl,
    });
  }

  if (!params.bookTitle) {
    return links;
  }

  const query = encodeURIComponent(params.bookTitle);
  const shortTitle = encodeURIComponent(
    params.bookTitle.replace(/\s*\([^)]*\)/g, "").trim()
  );
  const hooplaQuery = shortTitle.replace(/%20/g, "+");

  links.push(
    {
      label: "Amazon",
      url: `https://www.amazon.com/s?k=${query}&i=stripbooks`,
    },
    {
      label: "Audible",
      url: `https://www.audible.com/search?keywords=${query}`,
    },
    {
      label: "Libby",
      url: `https://libbyapp.com/search/librarypoint/search/query-${shortTitle}/page-1`,
    },
    {
      label: "Hoopla",
      url: `https://www.hoopladigital.com/search?q=${hooplaQuery}&scope=everything&type=direct`,
    }
  );

  return links;
}
