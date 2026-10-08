# Website integration

The Postparticle workspace is private. Published articles and documents are available through read-only API endpoints. Fetch them from your website’s server so article content and metadata are present in the rendered HTML. The API supplies content; it does not host a blog.

## Next.js guides

The public guides require no login or Spaces credentials. Start at `/developers` and follow these routes in order:

1. `/developers/nextjs/setup` configures the server environment and API helper. Its existing-project section includes a copyable prompt for an AI coding assistant. Supply the Postparticle URL, project ID, organization UUID, and website URL, then review the assistant's proposed changes.
2. `/developers/nextjs/articles` covers recent content, filters, and pagination.
3. `/developers/nextjs/article-pages` covers article routes, Markdown, media, and errors.
4. `/developers/nextjs/metadata-and-caching` covers SEO metadata, sitemaps, and freshness.

`/developers/api-reference` documents the public endpoints and response behavior. `/developers/troubleshooting` lists checks for common integration problems. Guide code examples are kept in sync with the runnable `examples/next-blog` application.

## API endpoints

```text
GET /api/v1/projects/{projectId}/articles?organizationId={organizationId}
GET /api/v1/projects/{projectId}/articles/{slug}?organizationId={organizationId}
GET /api/v1/projects/{projectId}/documents/{key}?organizationId={organizationId}
```

The article listing accepts these query parameters:

- `q` searches titles, excerpts, and Markdown bodies case-insensitively; maximum 200 characters.
- `tag` matches a tag exactly, without regard to case; maximum 60 characters.
- `order=asc|desc` sorts by article date. Slug order breaks date ties.
- `page` starts at 1. `pageSize` accepts 1–100 and defaults to 12.

Listing responses have the shape `{ items, total, page, pageSize }`. Article dates use `YYYY-MM-DD`; event timestamps are UTC ISO strings.

## Response fields and visibility

Article responses include the title, slug, excerpt, Markdown body, author, tags, article date, SEO fields, created/updated/published timestamps, `coverUrl`, and `socialImageUrl`. When no social image is set, use the cover image as a fallback. The API does not expose internal media IDs.

Document responses contain the key, title, tags, and arbitrary `value` JSON. Drafts, trashed content, accounts, events, object keys, and credentials are excluded. Missing or unpublished content returns 404, invalid input returns 400, and storage or configuration failures return 503 with a generic error message.

## Media references

JSON documents can contain media references in string values, such as `"media:550e8400-e29b-41d4-a716-446655440000"`. Article Markdown uses `![alt text](media:asset-id)` for images and `[caption](media:asset-id)` for video links.

When content is published, Postparticle validates referenced assets and creates public copies. API responses replace valid references with delivery URLs. Only complete, valid UUID references are resolved; malformed reference-like strings remain literal text. JSON field names such as `coverMediaId` and `socialMediaId` have no special meaning inside document values.

## Typed client

Copy `src/lib/client.ts` and its shared public types into your integration, or use the native-fetch example. This repository is an application, not a published SDK package.

```ts
const client = new PostparticleClient(
  "https://cms.example.com",
  "demo",
  process.env.POSTPARTICLE_ORGANIZATION_ID!,
);
const latest = await client.articles(
  { tag: "journal", pageSize: 3 },
  { next: { revalidate: 60 } },
);
const story = await client.article("a-little-room");
const banner = await client.document<{ headline: string }>("homepage-banner");
```

API responses use `Cache-Control: no-store`. Your website chooses its server-side cache policy. The example revalidates after 60 seconds, but the next request triggers revalidation; browser router and CDN caches can extend the delay. Avoid build-only fetching if content must update without rebuilding the website.

## Runnable Next.js example

`examples/next-blog` is a separate application that uses the repository’s dependencies. It includes a homepage with recent articles, `/blog` with tag filtering and pagination, `/blog/[slug]`, canonical and social metadata, Article JSON-LD, `sitemap.xml`, and a public `robots.txt`.

Start Postparticle, publish an article, and run the example from the repository root:

```sh
POSTPARTICLE_URL=http://localhost:3000 POSTPARTICLE_PROJECT=demo POSTPARTICLE_ORGANIZATION_ID="<organization-uuid>" WEBSITE_URL=http://localhost:3001 npm run example:dev -- --port 3001
```

Set `POSTPARTICLE_URL` to the base URL of your Postparticle deployment, `POSTPARTICLE_PROJECT` to your project ID, `POSTPARTICLE_ORGANIZATION_ID` to the owning organization UUID, and `WEBSITE_URL` to the base URL of your public website without a trailing slash. Build with `npm run example:build`.

To deploy the example separately, set the project root to `examples/next-blog` and copy the shared client and types into that project. Do not pass Spaces credentials to the website.

The example renders Markdown with raw HTML disabled and safe URL handling. It escapes `<` in JSON-LD so article text cannot close the script element. The workspace’s noindex headers do not apply to the separate website.
