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
organizations/{organizationId}/projects/{projectId}/indexes/content/{kind}/feed/{yyyy}/{mm}/{dd}/{hh}/{eventId}.json
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

Project registries are derived from the optional legacy baseline at
`organizations/{organizationId}/projects.json` and immutable per-project changes under
`organizations/{organizationId}/project-registry/changes/{projectId}/{edgeHash}.json`. Each change
stores the previous and next project hashes. Changes to different IDs compose; competing changes to
the same project are projected onto a stable branch and surfaced as a project-specific conflict
warning. A subsequent save records the chosen branch as the resolution, including an explicit
resolution marker for a no-op save, so it does not create another branch on later reads. Registry
reads project this log directly; there is no cross-instance registry cache. Deletion
markers are stored separately at
`organizations/{organizationId}/project-deletions/{projectId}.json`; every project request checks
this uncached marker, so a stale registry state cannot reopen a deleting project. Markers remain
after cleanup, which permanently retires deleted project IDs. Archiving hides a project from the
picker and new access assignments while preserving data and published reads. Permanent deletion is
limited to archived projects: the app marks the project as deleting, revokes explicit Perminister
project grants, waits six minutes for outstanding upload URLs to expire, then removes its exact
storage prefix in retryable batches. If cleanup fails, the project remains blocked and can be
resumed from **Account → Projects**. Published media already cached by a CDN may remain available
until that cache expires.

Every event records ID, UTC time, actor, action, and payload. Events use unique keys and remain immutable. Reads order by timestamp and UUID, independently of storage listing order. Append observes the newest existing event in that stream and chooses a timestamp later than it. Truly concurrent writes can still share a timestamp; UUID ordering breaks the tie. All writes are retained. The latest save wins for drafts; publish/unpublish events independently determine the public snapshot.

This is designed for small editorial teams. It does not provide distributed transactions, strict stale-editor rejection, or live co-editing. Identifier uniqueness comes from using the slug/key as the record identity. Concurrent creation with the same identifier can produce two retained revisions of the same record; one becomes the draft. Renaming identifiers is excluded from this release.

Content listings use versioned snapshots plus an append-only per-event feed tail; source event
objects remain authoritative. Normal content appends write the feed entry before the immutable
source event, so a failed source write can leave only a harmless dangling feed entry. Readers ignore
those dangling entries. A snapshot manifest is written after its shards and records a fixed replay
boundary. The fixed boundary includes a one-minute overlap for in-flight writes and small clock
skew. Readers validate snapshot shards and feed entries, use marker pagination to start at the
boundary's UTC hour, and fetch only the recent tail. Corrupt or incomplete snapshots and malformed
feed entries fall back to full event replay. A legacy import that writes source events directly must
be followed by `storage:checkpoint` so it backfills feed entries before indexed reads are relied on.

Snapshot shards are capped at 4 MiB or 200 records. Readers fall back to an older valid snapshot
or full replay when a generation is missing or invalid. After a new generation passes read-back
validation, the two newest complete valid generations are retained; older generations and corrupt
manifests are pruned. Well-formed unreferenced shard generations without manifests are retained for
24 hours so an in-progress concurrent build is not mistaken for an orphan. Malformed orphan keys
are pruned immediately. Source events and feed entries are retained. If source keys change while a
generation is built, the builder retries twice; if it remains unstable, it publishes no manifest
and does not prune existing snapshots.

Build checkpoints for one project's active organization namespace using the shared content storage credentials. Always supply the owning organization UUID, including for a project in the legacy namespace:

```sh
pnpm run storage:checkpoint -- demo --organization-id "<organization-uuid>"
```

Run this operator command after bulk imports and whenever the feed tail reaches 1,000 events. It
reports the pre-build unindexed-event count, rebuilds both content snapshots and feed backfill for
articles and documents, and reports the post-build tail count. It never removes source events.
It also builds the public article metadata snapshot used by the body-free listing endpoint. The
Settings & API page includes an admin-only Build/Rebuild index action. Use it after deploying metadata
index version 2 to prepare an existing project without running a command. Until the build succeeds,
the public endpoint returns a retryable 503. The `storage:checkpoint` command remains available for
pre-deployment or scripted rebuilds. Publish, unpublish, and trash mutations atomically replace the
metadata manifest, keeping
the total and first 100 items in the same snapshot. Later pages read at most two bounded page
shards. Failed index updates invalidate the manifest so a partial snapshot is not served; rerun
`storage:checkpoint` to recover from source content events. Mutations update canonical per-slug
entries tagged with the latest source event ID; unpublish and trash keep null-metadata tombstones so
a delayed older publish cannot restore stale metadata. Writers recheck source state after swapping
the manifest and retry if another instance changed an entry; repeated conflicts invalidate the
manifest and make reads fail closed.
`pnpm run benchmark:content` creates disposable local histories of 1,000, 5,000, and 10,000 events;
checks full-replay parity, including concurrent appends; and reports elapsed time, object reads,
list calls, keys enumerated, and estimated 1,000-key Spaces list pages for record listing, public
article listing, and single-article lookup. It also checks shard size limits. Local timings do not
model Spaces pagination latency.

For read-only measurements against an isolated development or preview Space, run `pnpm run storage:measure -- <project-id> --organization-id "<organization-uuid>" --confirm-non-production`. The command reports record counts and read/list metrics for record listing, public article listing, and a published-article lookup; it does not print content or write objects. Do not point it at production credentials. Compare those timings and list-page counts with the local benchmark.

Media becomes ready only after successful finalization. Multipart completion is checkpointed in its private upload ticket. Retrying finalization resumes validation and sealing; if a completion response or checkpoint was lost, the application checks for the completed staging object before proceeding. A committed asset is returned idempotently without overwriting its metadata. Cleanup can also be retried. Finalization checks file size, declared content type, container structure, required image dimensions or video container metadata, and bounded header/trailer data before sealing a private original. It rejects malformed or truncated files; it does not fully decode media or establish that a file is safe. No antivirus scanning or transcoding is provided. Publish copies assets to public delivery paths before writing the publication event, and the editor confirms this when media is attached. A failed publish can leave unused public copies; the content stays unpublished. Unpublishing removes content from the API but does not erase previously distributed media URLs or guarantee CDN recall. Never publish confidential media.

Deletion checks current draft and published references, including trashed drafts. Historical-only references are not protected: if you remove an asset no longer referenced by current content, an old revision referencing it cannot be republished without replacing that reference. The deletion event is recorded before origin objects are removed; if cleanup fails, retry the same DELETE request to finish removing the private original and public delivery object. Removing the origin object does not purge copies already cached by a CDN. Race conditions between deletion and another editor's save/publish are possible without transactions; failures remain visible and recoverable from backups.

Perminister owns password verification, session storage, account disabling, password resets, and
session revocation. The old control bucket may contain password verifiers and session records; keep
it private and outside the app's configured storage. Expired legacy sessions are not accepted by
the current app.

## Backups and restoration

Spaces does not provide built-in backups. Keep the single shared content Space private and enable
object versioning if desired, but maintain independent backups. The application credential is
scoped to that one bucket, while application organization/project scoping is enforced by key
construction and authorization; a compromised application credential can read, overwrite, or delete
every private object in that Space. Keep administrative and app credentials separate. Never put
credentials in command arguments or commit them.

### Create and check a backup

1. Configure separate `rclone` remotes for the source and backup locations on an operator-managed
   machine. Keep the backup destination private and its credentials outside the application
   environment.
2. Copy the entire content bucket into a new, uniquely named backup prefix. For example:

   ```sh
   rclone copy spaces-prod:content-bucket spaces-backup:backup-bucket/postparticle/run-20261016-120000 --metadata --progress
   ```

   `rclone copy` does not remove destination-only objects. Use a new run prefix for each full
   snapshot, and do not substitute `rclone sync` for this procedure. See the [rclone copy
   reference](https://rclone.org/commands/rclone_copy/).

3. Compare the source and backup. For a full byte comparison during a restore rehearsal, use
   `rclone check` with `--download`; it reads both copies and can take time and bandwidth:

   ```sh
   rclone check spaces-prod:content-bucket spaces-backup:backup-bucket/postparticle/run-20261016-120000 --download
   ```

   See the [rclone check reference](https://rclone.org/commands/rclone_check/). Retain the command
   output, run ID, source and destination names, and copy start/end times with the backup record.

4. A bucket-wide copy is not an atomic point-in-time snapshot. For a controlled rehearsal, schedule
   the copy while editors are not making changes. Record the copy interval and treat changes made
   during it as potentially outside the recovered set.

### Restore and rehearse

1. Create a fresh, private non-production content Space. Copy one selected backup prefix into its
   root with `rclone copy`; do not restore into a bucket containing live or unrelated content.
2. Keep restored objects private by default. Spaces permissions apply to objects, not folder-like
   prefixes. Configure `s3cmd` on the operator machine with the restored Space's endpoint and
   operator credentials stored in its protected config file. Then make only the delivery objects
   public, using the prefix or prefixes present in this Space:

   ```sh
   s3cmd setacl --acl-public --recursive "s3://<restored-bucket>/projects/<project-id>/public/media/"
   s3cmd setacl --acl-public --recursive "s3://<restored-bucket>/organizations/<organization-uuid>/projects/<project-id>/public/media/"
   ```

   These commands update object ACLs under each supplied key prefix; do not run them against the
   bucket root. Keep file listing private and do not set a bucket-wide public ACL. Preserve object
   content types and metadata. See DigitalOcean's [recursive file permission instructions](https://docs.digitalocean.com/products/spaces/reference/s3cmd-usage/#make-files-public-recursively).

3. Configure the non-production app to use the restored Space. Run
   `pnpm run storage:verify -- <project-id> --organization-id "<organization-uuid>" --confirm-non-production`
   against a project marked `production: false`.
4. Through the restored app and its public API, verify representative article and document histories,
   published responses, private media originals, and public delivery objects. Confirm an anonymous
   request can read a published delivery object and that ordinary private objects remain private.
   If the restored bucket uses a different CDN or domain, configure the matching media base URL and
   verify the returned links there.
5. Record the last known source event recovered, copy start/end, restore start/end, and any missing
   objects or repair steps. Use measured backup lag and restore duration to choose an RPO, RTO,
   backup cadence, and retention policy. Do not publish recovery targets before this rehearsal.

After bulk imports, run `storage:checkpoint` for each project to backfill feeds and rebuild snapshots;
monitor the reported unindexed-event count and run it again when a feed tail reaches 1,000 events.
Use `storage:measure` against a non-production Space to compare read/list behavior with the local
benchmark. Authentication is managed in Perminister and is not restored from the retired control
bucket. Public media URLs may change when buckets or CDN domains change; republish content and
invalidate website caches accordingly.

Application deployment rollback does not roll back content. Restore an article revision through its editor and explicitly publish it, or restore objects from a reviewed backup. Do not edit historical event JSON directly.
