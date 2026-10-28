# Local UI preview

Run `pnpm dev` and open http://localhost:3000/ui-preview. This development-only route renders production components with synthetic identity and data. Open “Preview controls” to select a screen and scenario, resize the browser, and use the theme control to review the UI. The controls sit above the preview so they do not cover page content. The route returns 404 outside development and does not bypass authentication on the actual application routes.

Preview links and logout are disabled. Fixture requests reject non-GET operations; forms can be filled and validated, but changes cannot be saved. Use synthetic values, not real passwords. This preview does not test authentication, persistence, storage, networking, or integrations.

## Screen coverage

| Production route                                             | Preview screen                                          | Fixture coverage                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/projects`                                                  | Choose a project                                        | Populated and empty picker                                                                                      |
| `/account`                                                   | Your account                                            | Password form; writes blocked                                                                                   |
| `/account/projects`                                          | Project administration; Create a project (non-admin)    | Active and archived projects, empty/error registry, creation, editing and deletion confirmation; writes blocked |
| `/account/platform-accounts`                                 | Platform accounts                                       | Admin, active and disabled users; empty/error list; expand project access; writes blocked                       |
| `/account/platform-accounts/create`                          | Create platform account                                 | Form and validation; writes blocked                                                                             |
| `/account/platform-accounts/reset-password`                  | Reset platform account password                         | Synthetic users and form; writes blocked                                                                        |
| `/workspace/[projectId]`                                     | Overview                                                | Populated, empty and error dashboard                                                                            |
| `/workspace/[projectId]/articles` and `/documents`           | Articles; JSON documents                                | Local search and filters; populated, empty, and error states. Retry remains in the simulated error state        |
| `/workspace/[projectId]/articles/new` and `/articles/[id]`   | New article editor; Existing article editor             | Synthetic article, draft/published/history variants; writes blocked                                             |
| `/workspace/[projectId]/documents/new` and `/documents/[id]` | New JSON document editor; Existing JSON document editor | New and existing synthetic documents; writes blocked                                                            |
| `/workspace/[projectId]/media` and `/media/[id]`             | Media library; Media details                            | Synthetic asset, empty/error library, synthetic image detail; writes blocked                                    |
| `/workspace/[projectId]/members`                             | Project members                                         | Synthetic members, empty/error; writes blocked                                                                  |
| `/workspace/[projectId]/settings`                            | Settings & API                                          | Synthetic status; writes blocked                                                                                |

The screen selector does not follow workspace links. Some scenarios do not apply to every screen; the existing-article selector offers draft, published, and history instead. The Workspace role selector exercises the real admin, editor, and viewer presentation props on workspace screens. Direct screen selection can still show an admin-only screen with another role, so it does not test server authorization. Upload and full navigation flows are not represented. Loading skeletons are not explicitly selectable. Add fixtures and pass the preview request to production components when expanding coverage; never direct a preview mutation to a real endpoint.

## Direct public routes

These routes have no authentication gate in their page/layout code and can be reviewed directly on the local dev server: `/`, `/login`, `/login?error=sso`, `/developers`, `/developers/api-reference`, `/developers/troubleshooting`, and `/developers/nextjs/setup`, `/articles`, `/article-pages`, `/metadata-and-caching` (each under `/developers/nextjs`). The login page redirects an already signed-in user to `/projects`; use a signed-out browser session for its UI. Login submission and SSO are real authentication actions, not preview fixtures. Developer resource download routes and public content APIs are endpoints rather than UI screens and may depend on configuration or storage. Error and not-found boundaries can be inspected through appropriate failing/unknown routes but have no dedicated fixture here.

`/projects`, `/account/**`, and `/workspace/**` require authentication in the actual application; use the mapped preview screens for visual work. Authentication callback/start routes and `/api/**` are not preview screens. The public example app under `examples/next-blog` is a separate application, not covered by this route.

Fixture data and request handling live in `src/app/ui-preview/preview.tsx`. In a copied checkout using a symlinked `node_modules`, install dependencies locally for a portable copy; Vitest can avoid writing its config cache through the symlink with `pnpm exec vitest run --configLoader runner tests/ui/preview.test.tsx`.
