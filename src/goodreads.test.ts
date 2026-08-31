import { afterEach, describe, expect, it, vi } from "vitest";
import { scrapeGoodreadsTitle } from "./goodreads.js";

describe("scrapeGoodreadsTitle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the reader fallback when Goodreads returns an empty WAF challenge", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 202 }))
      .mockResolvedValueOnce(
        new Response(
          "Title: A Trade of Blood (Ana and Din Mysteries, #3)\n\nURL Source: http://www.goodreads.com/book/show/102615935"
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scrapeGoodreadsTitle("https://www.goodreads.com/book/show/102615935")
    ).resolves.toBe("A Trade of Blood (Ana and Din Mysteries, #3)");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://www.goodreads.com/book/show/102615935",
      "https://r.jina.ai/http://www.goodreads.com/book/show/102615935",
    ]);
  });

  it("uses the reader fallback when the Goodreads request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Goodreads unavailable"))
      .mockResolvedValueOnce(new Response("Title: A Trade of Blood"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scrapeGoodreadsTitle("https://www.goodreads.com/book/show/102615935")
    ).resolves.toBe("A Trade of Blood");
  });
});
