# Spaces and Vercel setup

## Storage and projects

Create one private **Standard** Space for all project content. Organization registries are stored at `organizations/{organizationId}/projects.json`; new project content is stored beneath `organizations/{organizationId}/projects/{projectId}/`. The migrated Sentry8 projects retain their legacy `projects/{projectId}/` content namespace. Do not grant public bucket listing or blanket public read access. Only published delivery objects receive `public-read` ACLs. Perminister stores account, credential, permission, and session data separately.

Use a bucket-scoped read/write/delete key for the content Space. Configure bucket CORS/lifecycle through a separate administrative key as required by DigitalOcean’s permissions. Keep that administrative key outside the application.

The checked-in `projects.json` is only the input to the one-time migration utility. Configure `.env.local` with the destination Spaces credentials, then run:

```sh
npm run projects:migrate
```

Migration groups entries by `legacyOrganizationId`, preserves `production` visibility and the legacy storage mapping, and refuses to replace any existing S3 registry. Run it once for each separate environment bucket before directing that environment to the new registry. After migration, platform administrators manage projects in **Account → Projects**; changes take effect at runtime. New projects are visible in production by default. Demo Journal stays excluded because its migrated entry has `production: false`. Project IDs are immutable and use lowercase letters, numbers, hyphens, or underscores; IDs of permanently deleted projects stay retired. Secrets never belong in a registry.

Set the corresponding values from `.env.example` in `.env.local` and Vercel’s environment settings. `CONTENT_SPACES_*` configures the shared content bucket. The endpoint is the **origin**, for example `https://nyc3.digitaloceanspaces.com`. Never sign uploads against the CDN. Optional `CONTENT_MEDIA_BASE_URL` is the complete shared-bucket CDN/custom-domain URL and must use HTTPS. The application automatically falls back to the bucket origin URL. The content bucket key can access every project's prefix; Postparticle enforces project access in the application.

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

Configure lifecycle rules to abort incomplete multipart uploads beneath both `projects/` and `organizations/` after one day. To expire completed staging objects after two days, add a rule for each exact `projects/{projectId}/incoming/` or `organizations/{organizationId}/projects/{projectId}/incoming/` prefix. Upload tickets expire after 24 hours. If file transfer succeeds but a transient storage or finalization error occurs, the media library retains the upload and offers **Retry finalization** or **Discard upload**. A signature mismatch returns HTTP 415, removes the staging object and ticket, and is terminal. Keep the media screen open while resolving a transient failure; uploads abandoned by closing it are handled by the lifecycle rules. Cancellation requests abort the multipart upload and remove its ticket; the lifecycle rule handles disconnected clients that cannot complete cleanup. Tickets for abandoned uploads can be removed after their recorded expiry using an administrative maintenance job.

The application accepts JPEG, PNG, WebP, GIF, MP4, and WebM up to 1 GiB. SVG and HTML uploads are excluded. Finalization checks origin object length, declared content type, and a bounded file signature before copying to a private sealed original. Signature checks do not fully decode media or prove that a file is safe. No antivirus scanning or transcoding is provided. Signed single-upload URLs expire after five minutes; multipart parts receive individual five-minute URLs.

## Vercel

Import the repository into Vercel as a Next.js project, with Node.js 24, `npm ci`, and `npm run build`. Set `STORAGE_DRIVER=spaces` and `APP_ORIGIN` to the exact canonical CRM origin, including protocol. Route all login/mutation traffic through that origin; alternate preview origins need their own environment value and bucket CORS configuration.

Before enabling production login, configure a Vercel WAF rate-limit rule matching **POST `/api/auth/login`**, keyed by source IP, with at most **10 requests per 60 seconds** and an HTTP 429 response. Verify it in a staging deployment from a dedicated source IP: send more than 10 requests during one window, then confirm the matching request appears as a WAF rate-limit event in Vercel Firewall logs. The application has its own per-process 429 response, so an HTTP 429 by itself does not prove that the WAF rule fired. Only after confirming the edge event, set `LOGIN_RATE_LIMIT_CONFIGURED=true` and redeploy. Production authentication refuses login while this value is false. The per-process limiter in the app is defense in depth and is not a global serverless rate limiter. If your Vercel plan lacks rate limiting, configure an equivalent reverse-proxy rule and verify its logs before setting the flag.

PostParticle requires Perminister for authentication. Configure `PERMINISTER_BASE_URL`, `PERMINISTER_CLIENT_ID`, and `PERMINISTER_CLIENT_SECRET` in each environment. The user selects an organization from the organizations returned by their Perminister session; no deployment-wide organization ID is required. Use a separate Perminister app client for non-production environments. Grant the first platform administrator PostParticle product-admin access in each organization before enabling access there.

Set up HTTPS and the canonical domain before first login. Session cookies are secure, HTTP-only, and same-site; Perminister controls their lifetime. Manage accounts through **Platform accounts** and project roles through **Members**. Only platform administrators can create accounts; project administrators can grant access to existing accounts.

If migrating from the previous per-project bucket layout, copy each old object's key into `projects/{projectId}/{oldKey}` in the shared content bucket before deploying. This legacy namespace remains mapped to the Sentry8 organization so existing content is preserved. New organizations store objects under `organizations/{organizationId}/projects/{projectId}/`. Preserve content types; keep ordinary objects private and apply `public-read` only to copied keys under the legacy `projects/{projectId}/public/media/` or the corresponding organization-prefixed `public/media/` path. Keep the old buckets until you have verified representative articles, documents, history, and media. The application does not move existing objects automatically.

Run the real-storage verification command before accepting a deployment. Run an additional manual end-to-end upload, publish, and anonymous-read check against the deployed origin. Inspect Vercel errors and Spaces capacity/rate limits. The app emits generic error names rather than credentials or request bodies.

References: [Spaces compatibility](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/), [Spaces limits](https://docs.digitalocean.com/products/spaces/details/limits/), [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
