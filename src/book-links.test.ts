import { describe, it, expect } from "vitest";
import { buildBookSourceLinks } from "./book-links.js";

describe("buildBookSourceLinks", () => {
  it("returns empty array when given no params", () => {
    expect(buildBookSourceLinks({})).toEqual([]);
  });

  it("returns only Goodreads when no title is provided", () => {
    const links = buildBookSourceLinks({ bookUrl: "https://goodreads.com/book/123" });
    expect(links).toEqual([
      { label: "Goodreads", url: "https://goodreads.com/book/123" },
    ]);
  });

  it("includes all sources when both url and title are provided", () => {
    const links = buildBookSourceLinks({
      bookUrl: "https://goodreads.com/book/123",
      bookTitle: "The Great Gatsby",
    });
    expect(links.map((l) => l.label)).toEqual([
      "Goodreads",
      "Amazon",
      "Audible",
      "Libby",
      "Hoopla",
    ]);
  });

  it("strips series parenthetical from Libby and Hoopla URLs", () => {
    const links = buildBookSourceLinks({
      bookTitle: "Rise of the Ranger (The Echoes Saga, #1) by Philip C. Quaintrell",
    });

    const libby = links.find((l) => l.label === "Libby")!;
    const hoopla = links.find((l) => l.label === "Hoopla")!;

    expect(libby.url).toBe(
      "https://libbyapp.com/search/librarypoint/search/query-Rise%20of%20the%20Ranger%20by%20Philip%20C.%20Quaintrell/page-1"
    );
    expect(hoopla.url).toBe(
      "https://www.hoopladigital.com/search?q=Rise+of+the+Ranger+by+Philip+C.+Quaintrell&scope=everything&type=direct"
    );
  });

  it("uses full title (including parenthetical) for Amazon and Audible", () => {
    const links = buildBookSourceLinks({
      bookTitle: "Rise of the Ranger (The Echoes Saga, #1)",
    });

    const amazon = links.find((l) => l.label === "Amazon")!;
    const audible = links.find((l) => l.label === "Audible")!;

    expect(amazon.url).toContain(encodeURIComponent("Rise of the Ranger (The Echoes Saga, #1)"));
    expect(audible.url).toContain(encodeURIComponent("Rise of the Ranger (The Echoes Saga, #1)"));
  });

  it("encodes spaces as + in Hoopla URL", () => {
    const links = buildBookSourceLinks({ bookTitle: "The Hobbit" });
    const hoopla = links.find((l) => l.label === "Hoopla")!;
    expect(hoopla.url).toBe(
      "https://www.hoopladigital.com/search?q=The+Hobbit&scope=everything&type=direct"
    );
  });

  it("encodes spaces as %20 in Libby URL", () => {
    const links = buildBookSourceLinks({ bookTitle: "The Hobbit" });
    const libby = links.find((l) => l.label === "Libby")!;
    expect(libby.url).toBe(
      "https://libbyapp.com/search/librarypoint/search/query-The%20Hobbit/page-1"
    );
  });
});
