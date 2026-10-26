import { expect, it, vi } from "vitest";
import { PostparticleClient } from "@/lib/client";
it("encodes public identifiers and queries and preserves fetch options", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 })));
  const client = new PostparticleClient(
    "https://example.com/",
    "demo",
    "660601f6-c1c3-42b0-9118-c2285d7659a3",
    fetcher,
  );
  await client.articles({ tag: "a & b", order: "asc" }, { cache: "no-store" });
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://example.com/api/v1/projects/demo/articles?tag=a+%26+b&order=asc&organizationId=660601f6-c1c3-42b0-9118-c2285d7659a3",
  );
  expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });
});
it("requests paginated article metadata without changing fetch options", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], total: 0, page: 1, pageSize: 12 }),
      ),
    );
  const client = new PostparticleClient(
    "https://example.com",
    "demo",
    "660601f6-c1c3-42b0-9118-c2285d7659a3",
    fetcher,
  );
  await client.articleMetadataPage(
    { order: "desc", page: 1, pageSize: 12 },
    { cache: "no-store" },
  );
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://example.com/api/v1/projects/demo/articles/metadata?order=desc&page=1&pageSize=12&organizationId=660601f6-c1c3-42b0-9118-c2285d7659a3",
  );
  expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });
});
