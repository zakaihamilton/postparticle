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

Configure your Spaces credentials, then create the initial platform administrator:

```sh
npm run bootstrap -- admin
npm run dev
```

Bootstrap prompts for a password without echoing it. Choose at least 12 characters. It also accepts a password on stdin for automation; avoid placing secrets in command arguments or shell history. Bootstrap refuses to run once a platform administrator exists. Open [localhost:3000](http://localhost:3000).

For development without Spaces, set `STORAGE_DRIVER=local` in `.env.local`. This explicitly uses ignored `.local-storage/` files. It is a development adapter, not a database or supported deployment backend. It has a 32 MiB upload limit and single uploads only. Local storage is blocked on Vercel. Do not deploy fixture passwords or local test storage.

## Account names and recovery

Accounts can use a traditional username or an email address. Email usernames are trimmed and stored in lowercase; sign-in is case-insensitive for email addresses. Existing usernames continue to work. Email usernames are identifiers, not a verified email or an email-delivery service.

If you forget your username or password, a platform administrator can reset your password from **Platform accounts**. If you cannot sign in as an administrator, use the operator command with access to the configured storage:

```sh
npm run accounts -- list
npm run accounts -- reset admin
```

Replace `admin` with the username or email shown by `list`. The reset command prompts privately for a new password and confirmation, then revokes existing sessions. Passwords are hashed and cannot be recovered. These commands use `.env.local`, just like bootstrap, and preserve project permissions and account status.

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

Repnix inventories and runs the repository’s configured checks. `npm run health` requires type safety, linting, formatting, tests, accessibility lint rules, and dead-code detection. Browser tests exercise isolated local storage; they do not claim Spaces compatibility. Use `npm run storage:verify` with real credentials for the private JSON and pagination smoke check.

## License

MIT. See [LICENSE](LICENSE).
