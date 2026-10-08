export const integrationPrompt = `Integrate Postparticle into this existing website.

Postparticle base URL: {{POSTPARTICLE_URL}}
Postparticle project ID: {{POSTPARTICLE_PROJECT}}
Postparticle organization UUID: {{POSTPARTICLE_ORGANIZATION_ID}}
Public website URL: {{WEBSITE_URL}}

Before changing files:
1. Inspect the repository structure, framework and version, package scripts, existing content/data access, routing, styling, and metadata conventions.
2. Identify the smallest integration that fits those conventions. Do not replace the app structure or redesign unrelated pages.
3. Check the current Postparticle developer guides or integration reference for the verified public API contract. Do not invent endpoints, fields, or an SDK.

Implementation requirements:
- Read published content from the public Postparticle API on the website server. Never put credentials, private storage keys, or server configuration in browser code. The public content API does not require workspace credentials.
- Use the existing server-rendering or server-side data-fetching pattern. Encode project IDs, slugs, and document keys as URL path segments, and encode query parameters with URLSearchParams or the framework's equivalent.
- Use these endpoints when needed: GET {{POSTPARTICLE_URL}}/api/v1/projects/{{POSTPARTICLE_PROJECT}}/articles?organizationId={{POSTPARTICLE_ORGANIZATION_ID}}, GET {{POSTPARTICLE_URL}}/api/v1/projects/{{POSTPARTICLE_PROJECT}}/articles/{slug}?organizationId={{POSTPARTICLE_ORGANIZATION_ID}}, and GET {{POSTPARTICLE_URL}}/api/v1/projects/{{POSTPARTICLE_PROJECT}}/documents/{key}?organizationId={{POSTPARTICLE_ORGANIZATION_ID}}.
- The API returns published content only. Handle 404 for missing or unpublished content, 400 for invalid input, 503 for service or storage failures, and network errors using the project's existing error and not-found conventions.
- Preserve the existing site's caching policy where possible. The API response is no-store; the website must choose its own server-side cache or revalidation policy. Document any freshness tradeoff.
- If rendering article Markdown, use the project's established safe Markdown renderer. Keep raw HTML disabled unless the project has a deliberate, reviewed sanitization policy. Use resolved media URLs from the public response.
- Where the project supports article metadata, use the article SEO title and description with title and excerpt fallbacks, and use the canonical public website URL based on {{WEBSITE_URL}}.
- Follow the repository's language, lint, formatting, accessibility, and testing conventions. Add only dependencies that are necessary and not already available.

Make the integration, then report which files changed, the API behavior used, the cache policy, and any setup values the site owner must configure. Do not expose secrets or claim that a command passed unless you ran it.`;
