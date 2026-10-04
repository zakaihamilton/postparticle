# Storage, recovery, and limits

## Layout

The control Space stores private objects:

```text
users/{username}/{timestamp_uuid}.json
memberships/{projectId}/{username}/{timestamp_uuid}.json
sessions/{sha256_token}.json
```

Each project Space stores:

```text
content/articles/{slug}/{timestamp_uuid}.json
content/documents/{key}/{timestamp_uuid}.json
media/{uuid}/{timestamp_uuid}.json
uploads/{uuid}.json
incoming/{uuid}/asset
originals/{uuid}/asset
public/media/{uuid}/asset
```

Every event records ID, UTC time, actor, action, and payload. Events use unique keys and remain immutable. Reads order by timestamp and UUID, independently of storage listing order. Append observes the newest existing event in that stream and chooses a timestamp later than it. Truly concurrent writes can still share a timestamp; UUID ordering breaks the tie. All writes are retained. The latest save wins for drafts; publish/unpublish events independently determine the public snapshot.

This is designed for small editorial teams. It does not provide distributed transactions, strict stale-editor rejection, or live co-editing. Identifier uniqueness comes from using the slug/key as the record identity. Concurrent creation with the same identifier can produce two retained revisions of the same record; one becomes the draft. Renaming identifiers is excluded from this release.

Listings scan immutable events with bounded parallel reads. The adapter uses legacy S3 marker pagination because Spaces documentation reports limitations with ListObjectsV2 pagination. There is no authoritative mutable index and no in-memory data dependency across Vercel instances. Large event histories increase latency and request cost; before substantial growth, introduce a reconstructible index/checkpoint strategy and measure its behavior. Failed writes are surfaced, not silently accepted.

Media becomes ready only after successful finalization. Multipart completion is checkpointed in its private upload ticket. Retrying finalization resumes validation and sealing; if a completion response or checkpoint was lost, the application checks for the completed staging object before proceeding. A committed asset is returned idempotently without overwriting its metadata. Cleanup can also be retried. The staging object is copied to a separate private original, then its ticket and staging key are deleted. This prevents a still-valid upload URL from modifying a finalized original. Publish copies assets to public delivery paths before writing the publication event. A failed publish can leave unused public copies; the content stays unpublished. Unpublishing removes content from the API but does not erase previously distributed media URLs or guarantee CDN recall. Never publish confidential media.

Deletion checks current draft and published references, including trashed drafts. Historical-only references are not protected: if you remove an asset no longer referenced by current content, an old revision referencing it cannot be republished without replacing that reference. Race conditions between deletion and another editor's save/publish are possible without transactions; failures remain visible and recoverable from backups.

Session IDs are random; storage keys hash the cookie token. Passwords use scrypt with unique salts. Disabling accounts, password resets, and session revocation invalidate the session version immediately on the next authenticated read. Older account-event objects contain old password hashes and must stay private. Expired session objects are unreadable as sessions but should be periodically purged. Consider bucket lifecycle expiry for session objects longer than eight hours; keys contain no username.

## Backups and restoration

Spaces does not provide built-in backups. Enable object versioning if desired, but keep independent backups. Use an administrative tool such as rclone with encrypted credentials to copy each control/content bucket to a separate private backup bucket or encrypted offline location. Never put credentials in command arguments or commit them. Schedule regular copies and test restores; choose retention according to your needs.

Restore into fresh private buckets, configure their keys in a non-production environment, and run verification. Check accounts, memberships, article history, published responses, and representative originals. To revoke restored historical sessions, delete the restored `sessions/` prefix before enabling login. Public media URLs may change when buckets/CDN domains change; republish content and invalidate website caches accordingly.

Application deployment rollback does not roll back content. Restore an article revision through its editor and explicitly publish it, or restore objects from a reviewed backup. Do not edit historical event JSON directly.
