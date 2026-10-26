# Spaces and Vercel setup

## Storage and projects

Create one private **Standard** Space for all project content. Runtime project changes are stored immutably beneath `organizations/{organizationId}/project-registry/changes/{projectId}/`; an existing `organizations/{organizationId}/projects.json` is read only as a legacy baseline. New project content is stored beneath `organizations/{organizationId}/projects/{projectId}/`. The migrated Sentry8 projects retain their legacy `projects/{projectId}/` content namespace. Do not grant public bucket listing or blanket public read access. Ordinary objects use private ACLs; only published delivery objects receive `public-read` ACLs. Perminister stores account, credential, permission, and session data separately.

Use a key scoped to the single content Space with **Read/Write/Delete (Objects)** permissions for app operations; do not grant it **All (Buckets and Objects)**. The key can access every object in that Space; organization and project boundaries are enforced by the app's authorization checks and scoped object-key prefixes, not by per-prefix key permissions. This is the shared credential's blast radius. Keep Development, Preview, and Production credentials separate. Configure bucket CORS/lifecycle through a separate administrative key as required by DigitalOcean’s permissions, and keep that key outside the application.

The checked-in top-level `projects.json` supplies the guarded migration utility. At runtime, the application reads legacy organization-level `projects.json` objects as a read-only baseline and applies immutable per-project changes on top. Configure `.env.local` with the destination Spaces credentials, then run:

```sh
pnpm run projects:migrate
```

Migration groups entries by `legacyOrganizationId`, preserves `production` visibility and the legacy storage mapping, and refuses to replace any existing S3 registry. It writes immutable per-project entries and does not rewrite a full registry during admin updates. Run it once for each separate environment bucket before directing that environment to the new registry. After migration, platform administrators manage projects in **Account → Projects**; changes take effect at runtime. Concurrent changes to different projects compose. If concurrent changes affect the same project, the catalog selects a deterministic version and flags that project for review; saving it records the resolution. New projects are visible in production by default. Demo Journal stays excluded because its migrated entry has `production: false`. Project IDs are immutable and use lowercase letters, numbers, hyphens, or underscores; IDs of permanently deleted projects stay retired. Secrets never belong in a registry.

Set the corresponding values from `.env.example` in `.env.local` and Vercel’s environment settings. `CONTENT_SPACES_*` configures the shared content bucket. The endpoint is the **origin**, for example `https://nyc3.digitaloceanspaces.com`. Never sign uploads against the CDN. Optional `CONTENT_MEDIA_BASE_URL` is the complete shared-bucket CDN/custom-domain URL and must use HTTPS. The application automatically falls back to the bucket origin URL. Spaces `PutObject` does not provide a conditional-write guarantee used by this design. The app writes immutable event, feed, snapshot, and per-project change objects with deterministic keys where idempotency is needed; it does not assume compare-and-swap headers. Verify marker pagination and read-back behavior in a development Space before rollout.

Use different keys and buckets for Development, Preview, and Production. Do not point previews at production data. Vercel storage credentials must be server-only: do not prefix them with `NEXT_PUBLIC_`.

## Browser uploads

Set CORS on the shared content bucket for the exact CRM origin. Replace the origin below. Expose `ETag` for multipart uploads.

```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://cms.example.com</AllowedOrigin>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

Configure lifecycle rules to abort incomplete multipart uploads beneath both `projects/` and `organizations/` after one day. To expire completed staging objects after two days, add a rule for each exact `projects/{projectId}/incoming/` or `organizations/{organizationId}/projects/{projectId}/incoming/` prefix. Upload tickets expire after 24 hours. If file transfer succeeds but a transient storage or finalization error occurs, the media library retains the upload and offers **Retry finalization** or **Discard upload**. Malformed, truncated, or metadata-invalid media returns HTTP 415, removes the staging object and ticket, and is terminal. Keep the media screen open while resolving a transient failure; uploads abandoned by closing it are handled by the lifecycle rules. Cancellation requests abort the multipart upload and remove its ticket; the lifecycle rule handles disconnected clients that cannot complete cleanup. Tickets for abandoned uploads can be removed after their recorded expiry using an administrative maintenance job.

The application accepts JPEG, PNG, WebP, GIF, MP4, and WebM up to 1 GiB. SVG and HTML uploads are excluded. Finalization checks origin object length, declared content type, container structure, image dimensions or video container metadata, and bounded header/trailer data before copying to a private sealed original. These checks do not fully decode media or prove that a file is safe. No antivirus scanning or transcoding is provided. Before publishing content with media, the editor confirms that assets will be copied to public URLs. Unpublishing does not revoke media copies or guarantee CDN recall. Signed single-upload URLs expire after five minutes; multipart parts receive individual five-minute URLs.

## Vercel

Import the repository into Vercel as a Next.js project, with Node.js 24, `pnpm install --frozen-lockfile`, and `pnpm run build`. Set `STORAGE_DRIVER=spaces` and `APP_ORIGIN` to the exact canonical CRM origin, including protocol. Route all login/mutation traffic through that origin; alternate preview origins need their own environment value and bucket CORS configuration.

Before enabling production login, configure a Vercel WAF rate-limit rule matching **POST `/api/auth/login`**, keyed by source IP, with at most **10 requests per 60 seconds** and an HTTP 429 response. Verify it in a staging deployment from a dedicated source IP: send more than 10 requests during one window, then confirm the matching request appears as a WAF rate-limit event in Vercel Firewall logs. The application has its own per-process 429 response, so an HTTP 429 by itself does not prove that the WAF rule fired. Only after confirming the edge event, set `LOGIN_RATE_LIMIT_CONFIGURED=true` and redeploy. Production authentication refuses login while this value is false. The per-process limiter in the app is defense in depth and is not a global serverless rate limiter. If your Vercel plan lacks rate limiting, configure an equivalent reverse-proxy rule and verify its logs before setting the flag.

PostParticle requires Perminister for authentication. Configure `PERMINISTER_BASE_URL`, `PERMINISTER_CLIENT_ID`, and `PERMINISTER_CLIENT_SECRET` in each environment. The user selects an organization from the organizations returned by their Perminister session; no deployment-wide organization ID is required. Use a separate Perminister app client for non-production environments. Organization admins and owners receive full PostParticle access automatically. After adding PostParticle to an organization, grant product-admin access to any additional users who need it.

Set up HTTPS and the canonical domain before first login. Session cookies are secure, HTTP-only, and same-site; Perminister controls their lifetime. Manage accounts through **Platform accounts** and project roles through **Members**. Only platform administrators can create accounts; project administrators can grant access to existing accounts.

If migrating from the previous per-project bucket layout, copy each old object's key into `projects/{projectId}/{oldKey}` in the shared content bucket before deploying. This legacy namespace remains mapped to the Sentry8 organization so existing content is preserved. New organizations store objects under `organizations/{organizationId}/projects/{projectId}/`. Preserve content types; keep ordinary objects private and apply `public-read` only to copied keys under the legacy `projects/{projectId}/public/media/` or the corresponding organization-prefixed `public/media/` path. Keep the old buckets until you have verified representative articles, documents, history, and media. The application does not move existing objects automatically.

Before enabling indexed reads in production, use a Development Space and run `pnpm run storage:verify -- <project-id> --organization-id "<organization-uuid>" --confirm-non-production`. It must pass live marker pagination, feed-index read-back, indexed/full-replay API parity, and fallback from a deliberately invalid snapshot in an isolated temporary project prefix. After deploying metadata index version 2, a project admin can build each existing project's public metadata snapshot from its workspace overview. The public endpoint returns a retryable 503 until that build succeeds. For pre-deployment or scripted builds, run `pnpm run storage:checkpoint` for each project. Confirm the remaining replay tail is below 1,000 events. Then run `pnpm run storage:measure` against the same non-production project. Do not run verification or measurement against production credentials. Keep a private backup of the shared Space and verify a restore before production rollout.

After deploying, run a manual end-to-end upload, publish, and anonymous-read check against the deployed origin. Confirm the media disclosure appears for referenced assets. Inspect Vercel errors and Spaces capacity/rate limits. The app emits generic error names rather than credentials or request bodies.

References: [Spaces API reference](https://docs.digitalocean.com/reference/api/spaces/), [Spaces compatibility](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/), [Spaces limits](https://docs.digitalocean.com/products/spaces/details/limits/), [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
