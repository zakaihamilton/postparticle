# Website integration

The management workspace is private and excluded from indexing. Published content is publicly readable through versioned API endpoints. Render it on your website’s server so articles and SEO metadata are present in its HTML. The API itself is not the indexed blog.

## Developer pages

Public, server-rendered guides are available at `/developers`, with Next.js setup, article listings/search/tags, article routes, and SEO/freshness pages. They need no login or Spaces connection. Copyable source snippets mirror the checked, runnable `examples/next-blog` application; `npm test` verifies they stay in sync. The consuming website uses native server-side fetch; the optional typed client below remains available.

## Endpoints

```text
GET /api/v1/projects/{projectId}/articles
GET /api/v1/projects/{projectId}/articles/{slug}
GET /api/v1/projects/{projectId}/documents/{key}
```

Article listing parameters: `q` for case-insensitive title/excerpt/body search, `tag` for an exact case-insensitive tag, `order=asc|desc` for article-date ordering, `page` starting at 1, and `pageSize` from 1 to 100 (default 12). Slug ordering breaks date ties. Responses contain `{ items, total, page, pageSize }`. Dates use `YYYY-MM-DD`; event timestamps use UTC ISO strings.

Article responses contain title, slug, excerpt, Markdown body, author, tags, article date, SEO fields, created/updated/published timestamps, `coverUrl`, and `socialImageUrl`. When social image is unset, consumers should fall back to the cover. Internal cover/social media IDs are omitted. Document responses contain key, title, tags, and arbitrary `value` JSON. Drafts, trashed content, accounts, events, object keys, and credentials are excluded. Missing/unpublished content returns 404, invalid input returns 400, and storage/configuration failures return 503 with a generic error message.

Named JSON documents can contain media references in string values, such as `"media:550e8400-e29b-41d4-a716-446655440000"`. Article Markdown uses `![alt text](media:asset-id)` for images and `[caption](media:asset-id)` for video links. Publishing validates referenced assets and creates public copies; API responses replace these references with delivery URLs. Only complete, valid UUID references are resolved. Malformed reference-like strings remain literal text. Arbitrary JSON field names, including `coverMediaId` and `socialMediaId`, carry no special meaning inside document values.

## Typed client

Copy `src/lib/client.ts` and its shared public types into your integration, or adapt the generic example. This repository is an application, not a published SDK package.

```ts
const client = new PostparticleClient("https://cms.example.com", "demo");
const latest = await client.articles(
  { tag: "journal", pageSize: 3 },
  { next: { revalidate: 60 } },
);
const story = await client.article("a-little-room");
const banner = await client.document<{ headline: string }>("homepage-banner");
```

Public responses use `Cache-Control: no-store`; the website chooses its own server-side caching. The example uses Next.js revalidation of 60 seconds, so published changes may take that long to appear. Client router caches and external CDN caches can extend freshness. Do not use build-only fetching if articles must update without rebuilding the website.

## Generic Next.js example

`examples/next-blog` is a separate example application using the root dependencies. It contains a welcome-page recent-article section, `/blog` with tag filtering and pagination, `/blog/[slug]`, canonical/Open Graph/Twitter metadata, safe Article JSON-LD, `sitemap.xml`, and permissive public `robots.txt`.

Run Postparticle first, publish an article, then start the example:

```sh
POSTPARTICLE_URL=http://localhost:3000 POSTPARTICLE_PROJECT=demo WEBSITE_URL=http://localhost:3001 npm run example:dev -- --port 3001
```

Set `POSTPARTICLE_URL` to the CRM origin, `POSTPARTICLE_PROJECT` to your project ID, and `WEBSITE_URL` to the canonical public website origin. Build with `npm run example:build`. Never pass Spaces keys to the integration. To deploy it separately, use the same dependencies and set the project root to the example, ensuring the shared client/types are copied inside that project.

Markdown is rendered with raw HTML disabled and safe URL handling. JSON-LD escapes `<` to prevent closing the script tag. The CRM’s noindex headers do not apply to this separate website example.
