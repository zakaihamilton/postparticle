import { readBlogFilters } from "../examples/next-blog/lib/filters";
import Blog from "../examples/next-blog/app/blog/page";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { getArticle, getArticles } from "../examples/next-blog/lib/content";

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
afterEach(() => vi.unstubAllGlobals());
import { snippets, integrationGuide } from "@/components/developers/snippets";
import type { PublicArticle, ArticlePage } from "@/lib/types";
import type {
  PublicArticle as ExampleArticle,
  ArticlePage as ExamplePage,
} from "../examples/next-blog/lib/content";

describe("developer guide examples", () => {
  it("shows the exact integration files checked by the example build", () => {
    for (const snippet of Object.values(snippets)) {
      expect(snippet.code).toBe(
        readFileSync(`examples/next-blog/${snippet.filename}`, "utf8"),
      );
    }
    expect(integrationGuide).toBe(readFileSync("docs/integration.md", "utf8"));
  });
  it("uses the public API type contract without internal article fields", () => {
    expectTypeOf<ExampleArticle>().toEqualTypeOf<PublicArticle>();
    expectTypeOf<ExamplePage>().toEqualTypeOf<ArticlePage>();
  });
});

describe("documented native fetch helper", () => {
  it("omits unset filters and requests a 60-second cache", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [], total: 0, page: 2, pageSize: 12 }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    await getArticles({
      q: undefined,
      tag: "Field notes",
      order: "asc",
      page: 2,
    });
    const [url, options] = fetcher.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(params.has("q")).toBe(false);
    expect(params.get("tag")).toBe("Field notes");
    expect(params.get("order")).toBe("asc");
    expect(params.get("page")).toBe("2");
    expect(options).toEqual({ next: { revalidate: 60 } });
  });
  it("converts only article 404 responses to a route not-found result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(getArticle("missing")).rejects.toThrow("NEXT_NOT_FOUND");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    await expect(getArticle("story")).rejects.toThrow(
      "Postparticle returned 503",
    );
  });
  it("propagates a network failure instead of returning an empty list", async () => {
    const outage = new Error("Network unavailable");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(outage));
    await expect(getArticles()).rejects.toBe(outage);
  });
});

describe("blog URL filters", () => {
  it("accepts the API limits inclusively", () => {
    expect(
      readBlogFilters({
        q: "a".repeat(200),
        tag: "b".repeat(60),
        page: "100000",
        order: "asc",
      }).errors,
    ).toEqual([]);
    expect(readBlogFilters({}).pageNumber).toBe(1);
    expect(readBlogFilters({}).dateOrder).toBe("desc");
  });
  it.each([
    { q: "a".repeat(201) },
    { tag: "b".repeat(61) },
    { page: "100001" },
    { page: "0" },
    { page: "-1" },
    { page: "1.5" },
    { page: "invalid" },
    { page: "Infinity" },
    { page: "9007199254740992" },
    { order: "invalid" },
    { q: ["one", "two"] },
    { tag: ["one", "two"] },
    { page: ["1", "2"] },
    { order: ["asc", "desc"] },
  ])("does not fetch the API for invalid filters %j", async (params) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(readBlogFilters(params).errors.length).toBeGreaterThan(0);
    await Blog({ searchParams: Promise.resolve(params) });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
