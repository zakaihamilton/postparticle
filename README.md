# Postparticle

A calm, open-source workspace for articles, media, and dynamic JSON content. Built with Next.js, React, TypeScript, CSS Modules, and S3-compatible object storage. No database.

Public Next.js integration guides are available at `/developers`, linked from the welcome page and Settings & API.

The public welcome page is `/`; its login button leads to `/login`. After authentication, `/projects` lists only authorized projects. The wordmark highlights **article** within **postparticle**.

## Getting started

Use Node.js 24 and npm.

```sh
npm ci
cp .env.example .env.local
```

Configure the Perminister URL, organization ID, consumer client ID, and client secret in `.env.local`. Create or enable the account and grant PostParticle access in Perminister. For persistent content, configure the Content Spaces values from `.env.example`; to work without Spaces, use the local content adapter described below. Then start the app:

```sh
npm run dev
```

PostParticle does not store local passwords, accounts, or sessions. Open [localhost:3000](http://localhost:3000).

For content development without Spaces, set `STORAGE_DRIVER=local` in `.env.local`. This explicitly uses ignored `.local-storage/` files. It is a development adapter, not a database or supported deployment backend. Authentication still uses Perminister. Local content storage has a 32 MiB upload limit and single uploads only, and is blocked on Vercel.

## Account names and recovery

Accounts can use a traditional username or an email address. Email usernames are trimmed and stored in lowercase; sign-in is case-insensitive for email addresses. Existing usernames continue to work. Email usernames are identifiers, not a verified email or an email-delivery service.

If you forget your password, use the recovery process configured in Perminister or ask a platform administrator to reset it from **Platform accounts**. Account status, credentials, and sessions are managed centrally in Perminister.

## Features

- Private accounts, project-specific admin/editor/viewer permissions, expiring sessions, account disabling, password changes, administrator password resets, and session revocation.
- Markdown articles with safe live previews, tags, editable article dates, covers, and SEO fields.
- Separate drafts and public snapshots, manual publishing/unpublishing, trash/restore, and recoverable revisions.
- Private image/video originals, signed browser uploads, multipart videos, upload cancellation, metadata, alt text, and public delivery copies.
- Named arbitrary JSON documents; no collection schemas or schema builder.
- Published-only API and a typed fetch client with a generic server-rendered Next.js blog example.
- Responsive CSS Modules, light/dark/system themes, CSS animations, and reduced-motion support.

## Documentation

- [Spaces and Vercel setup](docs/deployment.md)
- [API and generic website integration](docs/integration.md)
- [Storage model, recovery, and operational limits](docs/storage.md)
- [Perminister authentication](docs/auth-migration.md)
- [Validation and repository guardrails](docs/validation.md)

## Development

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npm run health
npm run build
npx playwright install chromium
npm run test:e2e
```

Repnix inventories and runs the repository’s configured checks. `npm run health` requires type safety, linting, formatting, tests, accessibility lint rules, and dead-code detection. Browser tests use isolated content storage and a test-only Perminister service stub; they do not claim Spaces compatibility. Use `npm run storage:verify` with real credentials for the private JSON and pagination smoke check.

## License

MIT. See [LICENSE](LICENSE).
