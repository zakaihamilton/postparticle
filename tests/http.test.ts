import { expect, it } from "vitest";
import { readBytes, readJson, sameOrigin } from "@/lib/http";
it("bounds payloads even without a content-length header", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: "123456",
  });
  await expect(readBytes(request, 3)).rejects.toMatchObject({ status: 413 });
  expect(
    await readJson(
      new Request("http://localhost", { method: "POST", body: '{"ok":true}' }),
    ),
  ).toEqual({ ok: true });
  await expect(
    readJson(new Request("http://localhost", { method: "POST", body: "bad" })),
  ).rejects.toMatchObject({ status: 400 });
});
it("rejects cross-origin and missing-origin mutations", () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://cms.example.com";
  try {
    expect(() =>
      sameOrigin(
        new Request("https://cms.example.com", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() => sameOrigin(new Request("https://cms.example.com"))).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://cms.example.com", {
          headers: { origin: "https://cms.example.com" },
        }),
      ),
    ).not.toThrow();
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});
