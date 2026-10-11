import { randomUUID } from "node:crypto";
import { identifier, organizationIdentifier } from "../src/lib/config";
import { getProject } from "../src/lib/projects";
import { projectStore, SpacesStore } from "../src/lib/storage";
import {
  contentIndexStatus,
  readContentRecords,
  rebuildContentCheckpoints,
} from "../src/lib/content-state";
import { contentEventFeedKey } from "../src/lib/events";
import { listPublicArticles } from "../src/lib/public";
import type { Article, Event } from "../src/lib/types";
if (process.env.STORAGE_DRIVER !== "spaces")
  throw new Error(
    "Verification requires STORAGE_DRIVER=spaces and real Spaces credentials",
  );
const args = process.argv.slice(2);
const organizationOption = args.indexOf("--organization-id");
const rawOrganizationId =
  organizationOption >= 0 ? args[organizationOption + 1] : undefined;
if (organizationOption < 0 || !rawOrganizationId)
  throw new Error(
    'Usage: npm run storage:verify -- <project-id> --organization-id "<organization-uuid>" --confirm-non-production',
  );
if (!args.includes("--confirm-non-production"))
  throw new Error(
    "Storage verification writes temporary objects; pass --confirm-non-production only for a development Space.",
  );
if (process.env.VERCEL_ENV === "production")
  throw new Error("Refusing to run storage verification in production.");
const rawProjectId = args.find(
  (arg, index) =>
    !arg.startsWith("--") &&
    (organizationOption < 0 || index !== organizationOption + 1),
);
if (!rawProjectId) throw new Error("Project ID is required");
const projectId = identifier.parse(rawProjectId);
const organizationId = organizationIdentifier
  .parse(rawOrganizationId)
  .toLowerCase();
const project = await getProject(organizationId, projectId, {
  includeArchived: true,
});
if (project.production !== false)
  throw new Error(
    "Storage verification requires a project marked production:false",
  );
const store = new SpacesStore("CONTENT");
const root =
  project.legacyOrganizationId === organizationId
    ? `projects/${projectId}/`
    : `organizations/${organizationId}/projects/${projectId}/`;
const base = `${root}verification/${randomUUID()}`;
const verificationProjectId = identifier.parse(`verify-${randomUUID()}`);
const verificationStore = projectStore(organizationId, verificationProjectId);
try {
  await store.put(`${base}/record.json`, { test: "postparticle" });
  if (
    (await store.get<{ test: string }>(`${base}/record.json`))?.test !==
    "postparticle"
  )
    throw new Error("JSON round trip failed");
  for (let i = 0; i < 3; i++) await store.put(`${base}/page-${i}.json`, {});
  if ((await store.list(`${base}/`)).length !== 4)
    throw new Error("Listing failed");
  if ((await store.list(`${base}/`, `${base}/page-1.json`)).length !== 2)
    throw new Error("Listing after a marker failed");
  // Force pagination with MaxKeys=1 to validate the origin's marker behavior.
  const { ListObjectsCommand } = await import("@aws-sdk/client-s3");
  let marker: string | undefined;
  let count = 0;
  do {
    const page = await store.client.send(
      new ListObjectsCommand({
        Bucket: store.bucket,
        Prefix: `${base}/`,
        MaxKeys: 1,
        Marker: marker,
      }),
    );
    count += page.Contents?.length ?? 0;
    if (!page.IsTruncated) break;
    const next = page.NextMarker ?? page.Contents?.at(-1)?.Key;
    if (!next || next === marker) throw new Error("Pagination failed");
    marker = next;
  } while (true);
  if (count !== 4) throw new Error("Pagination lost records");

  // Exercise index backfill, read parity, and invalid-snapshot recovery in a
  // disposable organization/project prefix rather than the selected project.
  const fixture: Article = {
    title: "Storage verification",
    slug: "storage-verification",
    excerpt: "Temporary storage verification article.",
    body: "Temporary fixture.",
    author: "PostParticle verification",
    tags: [],
    articleDate: new Date().toISOString().slice(0, 10),
    coverMediaId: "",
    seoTitle: "",
    seoDescription: "",
    socialMediaId: "",
  };
  const sourceEvents: Event<Article>[] = [];
  for (const [index, action] of ["save", "publish"].entries()) {
    const at = new Date(Date.now() - 120_000 + index * 1_000).toISOString();
    const id = `${at.replace(/[:.]/g, "-")}_${randomUUID()}`;
    const event: Event<Article> = {
      id,
      at,
      actor: "storage-verification",
      action,
      data: fixture,
    };
    await verificationStore.put(
      `content/articles/${fixture.slug}/${id}.json`,
      event,
    );
    sourceEvents.push(event);
  }
  const replay = await readContentRecords("articles", verificationStore);
  const publicReplay = await listPublicArticles(
    "verification",
    {},
    verificationStore,
  );
  const index = await rebuildContentCheckpoints("articles", verificationStore);
  if (!index.complete || index.indexedEvents !== 2 || !index.generation)
    throw new Error("Content index backfill failed");
  const feedKey = contentEventFeedKey(
    "articles",
    sourceEvents[0].at,
    sourceEvents[0].id,
  );
  const feedEntry = await verificationStore.get<{
    eventId: string;
    recordId: string;
    kind: string;
  }>(feedKey);
  if (
    feedEntry?.eventId !== sourceEvents[0].id ||
    feedEntry.recordId !== fixture.slug ||
    feedEntry.kind !== "articles"
  )
    throw new Error("Content index feed read-back failed");
  const indexed = await readContentRecords("articles", verificationStore);
  const publicIndexed = await listPublicArticles(
    "verification",
    {},
    verificationStore,
  );
  if (JSON.stringify(indexed) !== JSON.stringify(replay))
    throw new Error("Indexed content did not match full replay");
  if (JSON.stringify(publicIndexed) !== JSON.stringify(publicReplay))
    throw new Error("Indexed public API did not match full replay");
  if (
    (await contentIndexStatus("articles", verificationStore))
      .unindexedEvents !== 0
  )
    throw new Error("Content feed tail is not empty after backfill");

  const manifest = await verificationStore.get<{
    generation: string;
    shards: { key: string }[];
  }>(`checkpoints/content/articles/${index.generation}/manifest.json`);
  const shard = manifest?.shards[0];
  if (!manifest || !shard) throw new Error("Snapshot read-back failed");
  await verificationStore.put(shard.key, { corrupt: true });
  if (
    JSON.stringify(await readContentRecords("articles", verificationStore)) !==
    JSON.stringify(replay)
  )
    throw new Error("Invalid snapshot did not fall back to source replay");
  if (
    JSON.stringify(
      await listPublicArticles("verification", {}, verificationStore),
    ) !== JSON.stringify(publicReplay)
  )
    throw new Error("Public API did not recover from the invalid snapshot");
  console.log(
    "CONTENT: private JSON, marker pagination, index backfill/read-back, API parity, and corrupt-snapshot recovery passed.",
  );
} finally {
  for (const key of await store.list(`${base}/`)) await store.remove(key);
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await verificationStore.purgePrefixBatch("");
    if (result.done) break;
    if (attempt === 99)
      throw new Error("Could not clean up temporary verification objects");
  }
}
