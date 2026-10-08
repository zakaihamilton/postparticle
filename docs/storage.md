# Storage, recovery, and limits

## Layout

PostParticle now stores content only. The retired local-auth control bucket may contain historical
objects from before the Perminister cutover:

```text
users/{username}/{timestamp_uuid}.json
memberships/{projectId}/{username}/{timestamp_uuid}.json
bootstrap/platform-admins/{timestamp_uuid}.json
sessions/{sha256_token}.json
```

These records are retained as an offline historical backup only. PostParticle does not read or write
them, and the app no longer has credentials for that bucket. Perminister is the source of truth for
accounts, credentials, sessions, and access.

New organization content is namespaced by both organization and project:

```text
organizations/{organizationId}/projects/{projectId}/content/articles/{slug}/{timestamp_uuid}.json
organizations/{organizationId}/projects/{projectId}/content/documents/{key}/{timestamp_uuid}.json
organizations/{organizationId}/projects/{projectId}/checkpoints/content/{kind}/{generation}/manifest.json
organizations/{organizationId}/projects/{projectId}/checkpoints/content/{kind}/{generation}/shard-00000.json
organizations/{organizationId}/projects/{projectId}/media/{uuid}/{timestamp_uuid}.json
organizations/{organizationId}/projects/{projectId}/uploads/{uuid}.json
organizations/{organizationId}/projects/{projectId}/incoming/{uuid}/asset
organizations/{organizationId}/projects/{projectId}/originals/{uuid}/asset
organizations/{organizationId}/projects/{projectId}/public/media/{uuid}/asset
```

The Sentry8 organization keeps its existing `projects/{projectId}/...` namespace so current content
and media remain available. New organizations use the organization-prefixed path. The content
storage credential can access every prefix; the application scopes reads and writes by the active
Perminister organization and its project grants.

Every event records ID, UTC time, actor, action, and payload. Events use unique keys and remain immutable. Reads order by timestamp and UUID, independently of storage listing order. Append observes the newest existing event in that stream and chooses a timestamp later than it. Truly concurrent writes can still share a timestamp; UUID ordering breaks the tie. All writes are retained. The latest save wins for drafts; publish/unpublish events independently determine the public snapshot.

This is designed for small editorial teams. It does not provide distributed transactions, strict stale-editor rejection, or live co-editing. Identifier uniqueness comes from using the slug/key as the record identity. Concurrent creation with the same identifier can produce two retained revisions of the same record; one becomes the draft. Renaming identifiers is excluded from this release.

Listings still enumerate immutable event keys, while checkpoints reduce how many event bodies they fetch. The adapter uses legacy S3 marker pagination because Spaces documentation reports limitations with ListObjectsV2 pagination. There is no authoritative mutable index and no in-memory data dependency across Vercel instances. Large histories can still increase listing latency and request cost; measure pagination as the event log grows and consider a reconstructible key index if it becomes the bottleneck. Failed writes are surfaced, not silently accepted.

Content checkpoints are versioned derived snapshots; the event objects remain authoritative. Each checkpoint generation has a manifest written after its shards. Shards are capped at 4 MiB or 1,000 records and contain each record's reduced state, last folded event cursor, and replay cutoff. The newest event timestamp for a record remains in the replay tail, so events sharing that timestamp continue to follow the existing UUID tie ordering. Readers verify shard hashes and fall back to an older valid generation or full event replay when a checkpoint is missing or invalid. After a new generation passes read-back validation, the two newest complete valid generations are retained; older generations and corrupt manifests are pruned. Well-formed unreferenced shard generations without manifests are retained for 24 hours so an in-progress concurrent build is not mistaken for an orphan. Malformed orphan keys are pruned immediately. Source events are never pruned. If source keys change while a generation is built, the builder retries twice; if it remains unstable, it publishes no manifest and does not prune existing checkpoints.

Build checkpoints for one project's active organization namespace using the shared content storage credentials. Omit the organization option only when rebuilding a project in the legacy namespace:

```sh
npm run storage:checkpoint -- demo --organization-id "<organization-uuid>"
```

Run this operator command against a quiet project after bulk imports or when the replay tail grows. It processes articles and documents and never removes source events. `npm run benchmark:content` creates disposable local fixtures of 1,000, 5,000, and 10,000 events and reports elapsed time, object reads, list calls, keys enumerated, and estimated 1,000-key Spaces list pages for record listing, public article listing, and single-article lookup before and after checkpointing. It also checks the shard size limits. The local benchmark exposes the remaining full key-list scan but does not model Spaces pagination latency.

For read-only measurements against an isolated development or preview Space, run `npm run storage:measure -- <project-id> --organization-id "<organization-uuid>" --confirm-non-production`. Omit the organization option only for the legacy Sentry8 namespace. The command reports record counts and read/list metrics for record listing, public article listing, and a published-article lookup; it does not print content or write objects. Do not point it at production credentials. Compare those timings and list-page counts with the local benchmark before deciding whether a reconstructible key index is warranted.

Media becomes ready only after successful finalization. Multipart completion is checkpointed in its private upload ticket. Retrying finalization resumes validation and sealing; if a completion response or checkpoint was lost, the application checks for the completed staging object before proceeding. A committed asset is returned idempotently without overwriting its metadata. Cleanup can also be retried. The staging object is copied to a separate private original, then its ticket and staging key are deleted. This prevents a still-valid upload URL from modifying a finalized original. Publish copies assets to public delivery paths before writing the publication event. A failed publish can leave unused public copies; the content stays unpublished. Unpublishing removes content from the API but does not erase previously distributed media URLs or guarantee CDN recall. Never publish confidential media.

Deletion checks current draft and published references, including trashed drafts. Historical-only references are not protected: if you remove an asset no longer referenced by current content, an old revision referencing it cannot be republished without replacing that reference. Race conditions between deletion and another editor's save/publish are possible without transactions; failures remain visible and recoverable from backups.

Perminister owns password verification, session storage, account disabling, password resets, and
session revocation. The old control bucket may contain password verifiers and session records; keep
it private and outside the app's configured storage. Expired legacy sessions are not accepted by
the current app.

## Backups and restoration

Spaces does not provide built-in backups. Enable object versioning if desired, but keep independent backups. Use an administrative tool such as rclone with encrypted credentials to copy each control/content bucket to a separate private backup bucket or encrypted offline location. Never put credentials in command arguments or commit them. Schedule regular copies and test restores; choose retention according to your needs.

Restore content into a fresh private bucket, configure its key in a non-production environment,
and run verification. Check article history, published responses, and representative originals.
Authentication is managed in Perminister and is not restored from the retired control bucket. Public
media URLs may change when buckets/CDN domains change; republish content and invalidate website
caches accordingly.

Application deployment rollback does not roll back content. Restore an article revision through its editor and explicitly publish it, or restore objects from a reviewed backup. Do not edit historical event JSON directly.
