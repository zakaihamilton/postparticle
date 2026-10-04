import { expect, it, vi } from "vitest";
import { PostparticleClient } from "@/lib/client";
it("encodes public identifiers and queries and preserves fetch options", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 })));
  const client = new PostparticleClient(
    "https://example.com/",
    "demo",
    fetcher,
  );
  await client.articles({ tag: "a & b", order: "asc" }, { cache: "no-store" });
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://example.com/api/v1/projects/demo/articles?tag=a+%26+b&order=asc",
  );
  expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });
});
