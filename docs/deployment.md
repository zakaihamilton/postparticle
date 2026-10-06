# Spaces and Vercel setup

## Storage and projects

Create a private **Standard** Space for accounts/sessions and one private Standard Space for all project content. Each project is stored beneath `projects/{projectId}/` in the shared content Space. Do not grant public bucket listing or blanket public read access. Only published delivery objects receive `public-read` ACLs.

Use separate bucket-scoped read/write/delete keys for the control Space and shared content Space. Configure bucket CORS/lifecycle through a separate administrative key as required by DigitalOcean’s permissions. Keep that administrative key outside the application.

Edit `projects.json` with non-secret entries:

```json
[
  {
    "id": "demo",
    "name": "Demo Journal",
    "description": "Stories, ideas, and everything in between.",
    "production": false
  },
  {
    "id": "sentry8",
    "name": "SENTRY8",
    "description": "SENTRY8 content and media."
  }
]
```

Set `production` to `false` to keep a project in local development and preview deployments while excluding it from production. Demo Journal is a sample project and is excluded from the production registry. IDs use lowercase letters, numbers, hyphens, or underscores; start with a letter or number. `new` is reserved by the editor routing and must not be used as an article slug or document key. Adding a project requires a new registry entry and redeployment, but no project-specific storage variables. Secrets never belong in this registry.

Set the corresponding values from `.env.example` in `.env.local` and Vercel’s environment settings. `CONTROL_SPACES_*` configures shared authentication; `CONTENT_SPACES_*` configures the shared content bucket. The endpoint is the **origin**, for example `https://nyc3.digitaloceanspaces.com`. Never sign uploads against the CDN. Optional `CONTENT_MEDIA_BASE_URL` is the complete shared-bucket CDN/custom-domain URL and must use HTTPS. The application automatically falls back to the bucket origin URL. The content bucket key can access every project's prefix; Postparticle enforces project access in the application. The separate control bucket keeps account and session objects apart.

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

Configure a lifecycle rule on the shared content bucket to abort incomplete multipart uploads under `projects/` after one day. To expire completed staging objects after two days, add a rule for each exact `projects/{projectId}/incoming/` prefix; add that rule when you add a project. Upload tickets expire after 24 hours. If file transfer succeeds but a transient storage or finalization error occurs, the media library retains the upload and offers **Retry finalization** or **Discard upload**. A signature mismatch returns HTTP 415, removes the staging object and ticket, and is terminal. Keep the media screen open while resolving a transient failure; uploads abandoned by closing it are handled by the lifecycle rules. Cancellation requests abort the multipart upload and remove its ticket; the lifecycle rule handles disconnected clients that cannot complete cleanup. Tickets for abandoned uploads can be removed after their recorded expiry using an administrative maintenance job.

The application accepts JPEG, PNG, WebP, GIF, MP4, and WebM up to 1 GiB. SVG and HTML uploads are excluded. Finalization checks origin object length, declared content type, and a bounded file signature before copying to a private sealed original. Signature checks do not fully decode media or prove that a file is safe. No antivirus scanning or transcoding is provided. Signed single-upload URLs expire after five minutes; multipart parts receive individual five-minute URLs.

## Vercel

Import the repository into Vercel as a Next.js project, with Node.js 24, `npm ci`, and `npm run build`. Set `STORAGE_DRIVER=spaces` and `APP_ORIGIN` to the exact canonical CRM origin, including protocol. Route all login/mutation traffic through that origin; alternate preview origins need their own environment value and bucket CORS configuration.

Before enabling production login, configure a Vercel WAF rate-limit rule matching **POST `/api/auth/login`**, keyed by source IP, with at most **10 requests per 60 seconds** and an HTTP 429 response. Verify it in a staging deployment from a dedicated source IP: send more than 10 requests during one window, then confirm the matching request appears as a WAF rate-limit event in Vercel Firewall logs. The application has its own per-process 429 response, so an HTTP 429 by itself does not prove that the WAF rule fired. Only after confirming the edge event, set `LOGIN_RATE_LIMIT_CONFIGURED=true` and redeploy. Production authentication refuses login while this value is false. The per-process limiter in the app is defense in depth and is not a global serverless rate limiter. If your Vercel plan lacks rate limiting, configure an equivalent reverse-proxy rule and verify its logs before setting the flag.

Set up HTTPS and the canonical domain before first login. Session cookies are secure, HTTP-only, same-site, and last eight hours. To create the first Production administrator, generate a temporary 64-character hexadecimal token (`openssl rand -hex 32`), add it as a sensitive Production environment variable named `INITIAL_ADMIN_BOOTSTRAP_TOKEN`, and deploy. Send a same-origin `POST /api/bootstrap` request with an `Origin` header matching `APP_ORIGIN`, `Authorization: Bearer <token>`, and a JSON body containing `username` and a password of at least 12 characters:

```http
POST /api/bootstrap
Origin: https://your-canonical-origin
Authorization: Bearer <token>
Content-Type: application/json

{"username":"admin","password":"<initial-password>"}
```

Use HTTPS and a secure API client; don't save the token or password in shell history or request logs. The endpoint uses the deployed app's control Space credentials and creates the platform administrator, who has implicit admin access to every configured project. Concurrent initial setup requests converge on one administrator. It returns 404 when the token is missing or invalid and refuses bootstrap after a platform administrator exists. Remove `INITIAL_ADMIN_BOOTSTRAP_TOKEN` from Vercel and redeploy after success. This avoids downloading Spaces credentials to a local machine. The local `npm run bootstrap -- admin` command remains available for development and trusted operator use. Manage subsequent accounts through Account settings; grant roles through project Members. Project admins can grant access to existing accounts, but only platform admins create accounts.

If migrating from the previous per-project bucket layout, copy each old object's key into `projects/{projectId}/{oldKey}` in the shared content bucket before deploying this storage layout. Preserve content types; keep ordinary objects private and apply `public-read` only to copied keys under `projects/{projectId}/public/media/`. Keep the old buckets until you have verified representative articles, documents, history, and media. The application does not move existing objects automatically.

Run the real-storage verification command before accepting a deployment. Run an additional manual end-to-end upload, publish, and anonymous-read check against the deployed origin. Inspect Vercel errors and Spaces capacity/rate limits. The app emits generic error names rather than credentials or request bodies.

References: [Spaces compatibility](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/), [Spaces limits](https://docs.digitalocean.com/products/spaces/details/limits/), [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
