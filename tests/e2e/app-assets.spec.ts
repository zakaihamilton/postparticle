import { expect, test } from "@playwright/test";

function htmlTags(html: string, tagName: "link" | "meta") {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, "g")) ?? [];
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function findMeta(html: string, name: string, value: string) {
  return htmlTags(html, "meta").find((tag) => attribute(tag, name) === value);
}

function pngDimensions(image: Buffer) {
  expect(image.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

test("branded app assets and metadata are available without changing noindex", async ({
  request,
}) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  expect(home.headers()["x-robots-tag"]).toContain("noindex");
  const homeHtml = await home.text();
  expect(homeHtml).toContain('name="robots" content="noindex, nofollow"');
  expect(homeHtml).toContain(
    "<title>Postparticle — A home for your content</title>",
  );

  const links = htmlTags(homeHtml, "link");
  expect(
    links.some(
      (tag) =>
        attribute(tag, "rel") === "icon" &&
        attribute(tag, "href")?.includes("/favicon.ico"),
    ),
  ).toBe(true);
  expect(
    links.some(
      (tag) =>
        attribute(tag, "rel") === "icon" &&
        attribute(tag, "href")?.includes("/icon.svg"),
    ),
  ).toBe(true);
  expect(
    links.some((tag) => attribute(tag, "rel") === "apple-touch-icon"),
  ).toBe(true);
  expect(
    links.some(
      (tag) =>
        attribute(tag, "rel") === "manifest" &&
        attribute(tag, "href")?.endsWith("/manifest.webmanifest"),
    ),
  ).toBe(true);
  expect(findMeta(homeHtml, "name", "application-name")).toContain(
    'content="Postparticle"',
  );
  expect(findMeta(homeHtml, "name", "mobile-web-app-capable")).toContain(
    'content="yes"',
  );
  expect(findMeta(homeHtml, "property", "og:site_name")).toContain(
    'content="Postparticle"',
  );
  expect(findMeta(homeHtml, "property", "og:image")).toContain(
    "/opengraph-image",
  );
  expect(findMeta(homeHtml, "name", "twitter:card")).toContain(
    'content="summary_large_image"',
  );
  expect(findMeta(homeHtml, "name", "twitter:image")).toContain(
    "/opengraph-image",
  );
  expect(
    htmlTags(homeHtml, "meta")
      .filter((tag) => attribute(tag, "name") === "theme-color")
      .map((tag) => ({
        media: attribute(tag, "media"),
        color: attribute(tag, "content"),
      })),
  ).toEqual([
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#101c29" },
  ]);

  const favicon = await request.get("/favicon.ico");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/x-icon");
  const faviconBytes = await favicon.body();
  expect(faviconBytes.readUInt16LE(2)).toBe(1);
  expect(faviconBytes.readUInt16LE(4)).toBe(3);
  expect([faviconBytes[6], faviconBytes[22], faviconBytes[38]]).toEqual([
    16, 32, 48,
  ]);
  expect([faviconBytes[7], faviconBytes[23], faviconBytes[39]]).toEqual([
    16, 32, 48,
  ]);

  const vectorIcon = await request.get("/icon.svg");
  expect(vectorIcon.status()).toBe(200);
  expect(vectorIcon.headers()["content-type"]).toContain("image/svg+xml");

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe("/projects");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#b9dcff");
  expect(manifest.icons).toEqual([
    expect.objectContaining({
      src: "/icons/postparticle-192.png",
      sizes: "192x192",
      type: "image/png",
    }),
    expect.objectContaining({
      src: "/icons/postparticle-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    }),
  ]);
  const signedOutLaunch = await request.get("/projects");
  expect(signedOutLaunch.url()).toMatch(/\/login$/);

  for (const [path, expectedSize] of [
    ["/icons/postparticle-192.png", 192],
    ["/icons/postparticle-512.png", 512],
    ["/apple-icon.png", 180],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("image/png");
    expect(pngDimensions(await response.body()), path).toEqual({
      width: expectedSize,
      height: expectedSize,
    });
  }

  const socialImage = await request.get("/opengraph-image");
  expect(socialImage.status()).toBe(200);
  expect(socialImage.headers()["content-type"]).toContain("image/png");
  expect(pngDimensions(await socialImage.body())).toEqual({
    width: 1200,
    height: 630,
  });

  const developers = await request.get("/developers");
  expect(developers.status()).toBe(200);
  expect(developers.headers()["x-robots-tag"]).toContain("noindex");
  const developersHtml = await developers.text();
  expect(developersHtml).toContain(
    "<title>Developer guides · Postparticle</title>",
  );
  expect(findMeta(developersHtml, "name", "description")).toContain(
    'content="Integrate published Postparticle content with Next.js using the public API, with endpoint reference and troubleshooting guides."',
  );
  expect(findMeta(developersHtml, "property", "og:title")).toContain(
    "Developer guides · Postparticle",
  );
  expect(findMeta(developersHtml, "property", "og:description")).toContain(
    "Integrate published Postparticle content with Next.js using the public API, with endpoint reference and troubleshooting guides.",
  );
});
