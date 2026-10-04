# Spaces and Vercel setup

## Storage and projects

Create a private **Standard** Space for accounts/sessions and a separate private Standard Space for each content project. Do not grant public bucket listing or blanket public read access. Only published delivery objects receive `public-read` ACLs.

Use a separate bucket-scoped read/write/delete key for the control Space and each content Space. Configure bucket CORS/lifecycle through a separate administrative key as required by DigitalOcean’s permissions. Keep that administrative key outside the application.

Edit `projects.json` with non-secret entries:

```json
[
  {
    "id": "demo",
    "name": "Demo Journal",
    "description": "Stories, ideas, and everything in between.",
    "envPrefix": "PROJECT_DEMO"
  }
]
```

IDs use lowercase letters, numbers, hyphens, or underscores; start with a letter or number. `new` is reserved by the editor routing and must not be used as an article slug or document key. Prefixes use uppercase letters, numbers, and underscores. New project entries and environment changes require redeployment. Secrets never belong in this registry.

Set the corresponding values from `.env.example` in `.env.local` and Vercel’s environment settings. `CONTROL_SPACES_*` configures shared authentication; `PROJECT_DEMO_SPACES_*` configures Demo Journal. The endpoint is the **origin**, for example `https://nyc3.digitaloceanspaces.com`. Never sign uploads against the CDN. Optional `PROJECT_DEMO_MEDIA_BASE_URL` is the complete bucket CDN/custom-domain URL and must use HTTPS. The application automatically falls back to the bucket origin URL.

Use different keys and buckets for Development, Preview, and Production. Do not point previews at production data. Vercel storage credentials must be server-only: do not prefix them with `NEXT_PUBLIC_`.

## Browser uploads

Set CORS on each content bucket for the exact CRM origin. Replace the origin below. Expose `ETag` for multipart uploads.

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

Configure a lifecycle rule to abort incomplete multipart uploads after one day and expire `incoming/` objects after two days. Upload tickets expire after 24 hours. If file transfer succeeds but finalization fails, the media library retains the upload and offers **Retry finalization** or **Discard upload** instead of immediately aborting it. Keep that screen open while resolving the failure; uploads abandoned by closing it are handled by the lifecycle rules. Cancellation requests abort the multipart upload and remove its ticket; the lifecycle rule handles disconnected clients that cannot complete cleanup. Tickets for abandoned uploads can be removed after their recorded expiry using an administrative maintenance job.

The application accepts JPEG, PNG, WebP, GIF, MP4, and WebM up to 1 GiB. SVG and HTML uploads are excluded. Finalization checks origin object length and declared content type before copying to a private sealed original. No antivirus scanning, media decoding, or transcoding is provided. Signed single-upload URLs expire after five minutes; multipart parts receive individual five-minute URLs.

## Vercel

Import the repository into Vercel as a Next.js project, with Node.js 24, `npm ci`, and `npm run build`. Set `STORAGE_DRIVER=spaces` and `APP_ORIGIN` to the exact canonical CRM origin, including protocol. Route all login/mutation traffic through that origin; alternate preview origins need their own environment value and bucket CORS configuration.

Before enabling production login, configure a Vercel WAF rate-limit rule matching **POST `/api/auth/login`**, keyed by source IP, with at most **10 requests per 60 seconds** and an HTTP 429 response. Confirm the rule works, then set `LOGIN_RATE_LIMIT_CONFIGURED=true` and redeploy. Production authentication refuses login while this value is false. The per-process limiter in the app is defense in depth and is not a global serverless rate limiter. If your Vercel plan lacks rate limiting, configure an equivalent reverse-proxy rule before setting the flag.

Set up HTTPS and the canonical domain before first login. Session cookies are secure, HTTP-only, same-site, and last eight hours. Provision the first administrator using the bootstrap script with production environment values on a trusted local machine. Manage subsequent accounts through Account settings; grant roles through project Members. Project admins can grant access to existing accounts, but only platform admins create accounts.

Run the real-storage verification command before accepting a deployment. Run an additional manual end-to-end upload, publish, and anonymous-read check against the deployed origin. Inspect Vercel errors and Spaces capacity/rate limits. The app emits generic error names rather than credentials or request bodies.

References: [Spaces compatibility](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/), [Spaces limits](https://docs.digitalocean.com/products/spaces/details/limits/), [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
