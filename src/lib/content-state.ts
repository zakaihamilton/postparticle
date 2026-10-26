import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { identifier } from "./config";
import { mapBounded, type Store } from "./storage";
import {
  contentEventFeedKey,
  contentEventFeedPrefix,
  type ContentEventFeedEntry,
} from "./events";
import type {
  Article,
  Content,
  Event,
  JsonDocument,
  Kind,
  RecordState,
  WorkspaceDashboardArticle,
} from "./types";

const checkpointVersion = 2;
const maxShardBytes = 4 * 1024 * 1024;
const maxShardRows = 200;
const checkpointRetries = 2;
const checkpointOrphanGraceMs = 24 * 60 * 60 * 1000;
const snapshotOverlapMs = 60 * 1000;

interface CheckpointRow {
  id: string;
  /** Last source event folded into state. */
  cursor: string;
  /** Events at this instant stay in the replay tail to preserve concurrent tie ordering. */
  cutoffAt: string;
  state: RecordState<Content>;
}

interface CheckpointShard {
  version: number;
  kind: Kind;
  generation: string;
  rows: CheckpointRow[];
}

interface DashboardCheckpointShard {
  version: 1;
  kind: "articles";
  generation: string;
  rows: WorkspaceDashboardArticle[];
}

interface DashboardShardDescriptor {
  key: string;
  firstId: string;
  lastId: string;
  rows: number;
  bytes: number;
  sha256: string;
}

interface CheckpointManifest {
  version: number;
  kind: Kind;
  generation: string;
  /** Events before this UTC instant are folded into the snapshot. */
  cutoffAt: string;
  records: number;
  indexedEvents: number;
  shards: Array<{
    key: string;
    firstId: string;
    lastId: string;
    rows: number;
    bytes: number;
    sha256: string;
  }>;
  /** Compact article rows used by the workspace overview. */
  dashboardShards?: DashboardShardDescriptor[];
}

export interface CheckpointBuildResult {
  generation: string | null;
  records: number;
  shards: number;
  retries: number;
  complete: boolean;
  indexedEvents?: number;
  unindexedEvents?: number;
  failure?:
    | "source-changed"
    | "source-unavailable"
    | "record-too-large"
    | "checkpoint-invalid";
}

function eventPrefix(kind: Kind) {
  return `content/${kind}`;
}

function checkpointPrefix(kind: Kind) {
  return `checkpoints/content/${kind}`;
}

function feedHour(at: string) {
  const date = new Date(at);
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCHours()).padStart(2, "0"),
  ].join("/");
}

function isFeedEntry(
  value: unknown,
  kind: Kind,
  key: string,
): value is ContentEventFeedEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ContentEventFeedEntry>;
  if (
    entry.version !== 1 ||
    entry.kind !== kind ||
    typeof entry.recordId !== "string" ||
    typeof entry.eventId !== "string" ||
    typeof entry.at !== "string" ||
    !Number.isFinite(Date.parse(entry.at)) ||
    typeof entry.action !== "string"
  )
    return false;
  try {
    identifier.parse(entry.recordId);
  } catch {
    return false;
  }
  const filename = key.slice(key.lastIndexOf("/") + 1).replace(/\.json$/, "");
  const prefix = `${contentEventFeedPrefix(kind)}${feedHour(entry.at)}/`;
  return (
    entry.eventId === filename &&
    key === contentEventFeedKey(kind, entry.at, entry.eventId) &&
    key.startsWith(prefix) &&
    eventTimeKey(entry.at) === eventTimeKeyFromPath(key)
  );
}

function eventKeysById(kind: Kind, keys: string[]) {
  const prefix = `${eventPrefix(kind)}/`;
  const grouped = new Map<string, string[]>();
  for (const key of keys) {
    if (!key.startsWith(prefix) || !key.endsWith(".json")) continue;
    const rest = key.slice(prefix.length).split("/");
    if (rest.length !== 2) continue;
    const [id, file] = rest;
    if (!file.endsWith(".json")) continue;
    try {
      identifier.parse(id);
    } catch {
      continue;
    }
    const group = grouped.get(id) ?? [];
    group.push(key);
    grouped.set(id, group);
  }
  for (const group of grouped.values()) group.sort();
  return grouped;
}

function eventTimeKeyFromPath(key: string) {
  const filename = key.slice(key.lastIndexOf("/") + 1).replace(/\.json$/, "");
  const separator = filename.lastIndexOf("_");
  return separator < 0 ? "" : filename.slice(0, separator);
}

function eventTimeKey(at: string) {
  return at.replace(/[:.]/g, "-");
}

function eventFromKey<T>(value: unknown, key: string): value is Event<T> {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<Event<T>>;
  const filename = key.slice(key.lastIndexOf("/") + 1).replace(/\.json$/, "");
  return (
    typeof event.id === "string" &&
    event.id === filename &&
    typeof event.at === "string" &&
    Number.isFinite(Date.parse(event.at)) &&
    eventTimeKey(event.at) === eventTimeKeyFromPath(key) &&
    typeof event.action === "string"
  );
}

function eventMatchesPath(kind: Kind, value: unknown, key: string) {
  if (!eventFromKey<Content>(value, key)) return false;
  const recordId = key.split("/").at(-2);
  const contentId =
    kind === "articles"
      ? (value.data as Article | undefined)?.slug
      : (value.data as JsonDocument | undefined)?.key;
  return recordId === contentId;
}

function stateFromUnknown(
  value: unknown,
  id: string,
): value is RecordState<Content> {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<RecordState<Content>>;
  return (
    state.id === id &&
    !!state.draft &&
    typeof state.createdAt === "string" &&
    typeof state.updatedAt === "string" &&
    typeof state.trashed === "boolean" &&
    typeof state.revision === "string" &&
    (state.published === null || !!state.published) &&
    (state.publishedAt === null || typeof state.publishedAt === "string")
  );
}

function isCheckpointRow(value: unknown): value is CheckpointRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CheckpointRow>;
  return (
    typeof row.id === "string" &&
    typeof row.cursor === "string" &&
    Number.isFinite(Date.parse(row.cutoffAt ?? "")) &&
    stateFromUnknown(row.state, row.id)
  );
}

function isDashboardArticle(
  value: unknown,
): value is WorkspaceDashboardArticle {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<WorkspaceDashboardArticle>;
  const draft = row.draft as
    Partial<WorkspaceDashboardArticle["draft"]> | undefined;
  return (
    typeof row.id === "string" &&
    !!draft &&
    typeof draft.title === "string" &&
    typeof draft.author === "string" &&
    Array.isArray(draft.tags) &&
    draft.tags.every((tag) => typeof tag === "string") &&
    typeof draft.articleDate === "string" &&
    typeof row.published === "boolean" &&
    typeof row.trashed === "boolean" &&
    typeof row.updatedAt === "string" &&
    Number.isFinite(Date.parse(row.updatedAt))
  );
}

function isManifest(
  value: unknown,
  kind: Kind,
  generation: string,
): value is CheckpointManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<CheckpointManifest>;
  const dashboardShardsValid =
    manifest.dashboardShards === undefined ||
    (kind === "articles" &&
      Array.isArray(manifest.dashboardShards) &&
      manifest.dashboardShards.every(
        (shard, index) =>
          !!shard &&
          shard.key ===
            `${checkpointPrefix(kind)}/${generation}/dashboard-shard-${String(index).padStart(5, "0")}.json` &&
          typeof shard.firstId === "string" &&
          typeof shard.lastId === "string" &&
          shard.firstId <= shard.lastId &&
          Number.isInteger(shard.rows) &&
          shard.rows > 0 &&
          shard.rows <= maxShardRows &&
          Number.isInteger(shard.bytes) &&
          shard.bytes > 0 &&
          shard.bytes <= maxShardBytes &&
          /^[a-f0-9]{64}$/.test(shard.sha256),
      ) &&
      manifest.dashboardShards.reduce(
        (count, shard) => count + shard.rows,
        0,
      ) === manifest.records);
  return (
    manifest.version === checkpointVersion &&
    manifest.kind === kind &&
    manifest.generation === generation &&
    typeof manifest.cutoffAt === "string" &&
    Number.isFinite(Date.parse(manifest.cutoffAt)) &&
    Number.isInteger(manifest.indexedEvents) &&
    manifest.indexedEvents! >= 0 &&
    Number.isInteger(manifest.records) &&
    manifest.records! >= 0 &&
    Array.isArray(manifest.shards) &&
    manifest.shards.every(
      (shard, index) =>
        !!shard &&
        shard.key ===
          `${checkpointPrefix(kind)}/${generation}/shard-${String(index).padStart(5, "0")}.json` &&
        typeof shard.firstId === "string" &&
        typeof shard.lastId === "string" &&
        shard.firstId <= shard.lastId &&
        Number.isInteger(shard.rows) &&
        shard.rows > 0 &&
        shard.rows <= maxShardRows &&
        Number.isInteger(shard.bytes) &&
        shard.bytes > 0 &&
        shard.bytes <= maxShardBytes &&
        /^[a-f0-9]{64}$/.test(shard.sha256),
    ) &&
    manifest.shards.reduce((count, shard) => count + shard.rows, 0) ===
      manifest.records &&
    dashboardShardsValid
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function generationFromManifestKey(kind: Kind, key: string) {
  const prefix = `${checkpointPrefix(kind)}/`;
  if (!key.startsWith(prefix) || !key.endsWith("/manifest.json")) return null;
  const generation = key.slice(prefix.length, -"/manifest.json".length);
  return generation && !generation.includes("/") ? generation : null;
}

async function checkpointManifests(kind: Kind, store: Store) {
  return (await store.list(`${checkpointPrefix(kind)}/`))
    .map((key) => ({ key, generation: generationFromManifestKey(kind, key) }))
    .filter(
      (item): item is { key: string; generation: string } => !!item.generation,
    )
    .sort((a, b) => b.generation.localeCompare(a.generation));
}

async function readManifest(
  kind: Kind,
  store: Store,
  candidate: { key: string; generation: string },
) {
  let value: unknown;
  try {
    value = await store.get<unknown>(candidate.key);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  return isManifest(value, kind, candidate.generation)
    ? (value as CheckpointManifest)
    : null;
}

async function readShard(
  kind: Kind,
  manifest: CheckpointManifest,
  descriptor: CheckpointManifest["shards"][number],
  store: Store,
) {
  let value: unknown;
  try {
    value = await store.get<unknown>(descriptor.key);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (!value || typeof value !== "object") return null;
  const shard = value as Partial<CheckpointShard>;
  if (
    shard.version !== checkpointVersion ||
    shard.kind !== kind ||
    shard.generation !== manifest.generation ||
    !Array.isArray(shard.rows) ||
    shard.rows.length !== descriptor.rows ||
    !shard.rows.every(isCheckpointRow)
  )
    return null;
  const serialized = JSON.stringify(value);
  if (
    Buffer.byteLength(serialized) !== descriptor.bytes ||
    sha256(serialized) !== descriptor.sha256
  )
    return null;
  const rows = shard.rows as CheckpointRow[];
  if (
    rows[0]?.id !== descriptor.firstId ||
    rows.at(-1)?.id !== descriptor.lastId ||
    rows.some((row, index) => index > 0 && rows[index - 1].id >= row.id)
  )
    return null;
  return rows;
}

async function readDashboardShard(
  manifest: CheckpointManifest,
  descriptor: DashboardShardDescriptor,
  store: Store,
) {
  let value: unknown;
  try {
    value = await store.get<unknown>(descriptor.key);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (!value || typeof value !== "object") return null;
  const shard = value as Partial<DashboardCheckpointShard>;
  if (
    shard.version !== 1 ||
    shard.kind !== "articles" ||
    shard.generation !== manifest.generation ||
    !Array.isArray(shard.rows) ||
    shard.rows.length !== descriptor.rows ||
    !shard.rows.every(isDashboardArticle)
  )
    return null;
  const serialized = JSON.stringify(value);
  if (
    Buffer.byteLength(serialized) !== descriptor.bytes ||
    sha256(serialized) !== descriptor.sha256
  )
    return null;
  const rows = shard.rows as WorkspaceDashboardArticle[];
  if (
    rows[0]?.id !== descriptor.firstId ||
    rows.at(-1)?.id !== descriptor.lastId ||
    rows.some((row, index) => index > 0 && rows[index - 1].id >= row.id)
  )
    return null;
  return rows;
}

async function readCompleteDashboardGeneration(store: Store) {
  for (const candidate of await checkpointManifests("articles", store)) {
    const manifest = await readManifest("articles", store, candidate);
    if (!manifest?.dashboardShards) continue;
    const shards = await mapBounded(manifest.dashboardShards, (descriptor) =>
      readDashboardShard(manifest, descriptor, store),
    );
    if (shards.some((rows) => !rows)) continue;
    const rows = (shards as WorkspaceDashboardArticle[][]).flat();
    if (
      rows.length !== manifest.records ||
      new Set(rows.map((row) => row.id)).size !== rows.length
    )
      continue;
    return { manifest, rows: new Map(rows.map((row) => [row.id, row])) };
  }
  return null;
}

async function readCompleteGeneration(kind: Kind, store: Store) {
  for (const candidate of await checkpointManifests(kind, store)) {
    const generation = await readGeneration(kind, store, candidate);
    if (generation) return generation;
  }
  return null;
}

async function readCheckpointRecord(
  kind: Kind,
  id: string,
  store: Store,
): Promise<{ manifest: CheckpointManifest; row: CheckpointRow | null } | null> {
  for (const candidate of await checkpointManifests(kind, store)) {
    const manifest = await readManifest(kind, store, candidate);
    if (!manifest) continue;
    const descriptor = manifest.shards.find(
      (shard) => id >= shard.firstId && id <= shard.lastId,
    );
    if (!descriptor) return { manifest, row: null };
    const rows = await readShard(kind, manifest, descriptor, store);
    if (!rows) continue;
    return { manifest, row: rows.find((row) => row.id === id) ?? null };
  }
  return null;
}

async function readGeneration(
  kind: Kind,
  store: Store,
  candidate: { key: string; generation: string },
) {
  const manifest = await readManifest(kind, store, candidate);
  if (!manifest) return null;
  const shards = await mapBounded(manifest.shards, (descriptor) =>
    readShard(kind, manifest, descriptor, store),
  );
  if (shards.some((rows) => !rows)) return null;
  const rows = (shards as CheckpointRow[][]).flat();
  if (
    rows.length !== manifest.records ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    return null;
  return { manifest, rows: new Map(rows.map((row) => [row.id, row])) };
}

function generationFromCheckpointKey(kind: Kind, key: string) {
  const prefix = `${checkpointPrefix(kind)}/`;
  if (!key.startsWith(prefix)) return null;
  const generation = key.slice(prefix.length).split("/", 1)[0];
  return generation || null;
}

function checkpointGenerationTime(generation: string) {
  const match = /^(\d{13})-/.exec(generation);
  return match ? Number(match[1]) : null;
}

async function nextCheckpointGeneration(kind: Kind, store: Store) {
  const latestTimestamp = (await store.list(`${checkpointPrefix(kind)}/`))
    .map((key) => generationFromCheckpointKey(kind, key))
    .filter((generation): generation is string => !!generation)
    .map(checkpointGenerationTime)
    .filter((timestamp): timestamp is number => timestamp !== null)
    .reduce((latest, timestamp) => Math.max(latest, timestamp), 0);
  const timestamp = Math.max(Date.now(), latestTimestamp + 1);
  return `${timestamp.toString().padStart(13, "0")}-${randomUUID()}`;
}

async function pruneCheckpointGenerations(
  kind: Kind,
  store: Store,
  currentGeneration: string,
) {
  const prefix = `${checkpointPrefix(kind)}/`;
  const keys = await store.list(prefix);
  const candidates = new Map(
    keys
      .map((key) => ({ key, generation: generationFromManifestKey(kind, key) }))
      .filter(
        (item): item is { key: string; generation: string } =>
          !!item.generation,
      )
      .map((item) => [item.generation, item]),
  );
  const currentCandidate = {
    key: `${prefix}${currentGeneration}/manifest.json`,
    generation: currentGeneration,
  };
  candidates.set(currentGeneration, currentCandidate);
  const ordered = [...candidates.values()].sort((a, b) =>
    b.generation.localeCompare(a.generation),
  );
  const valid = new Set<string>();
  for (const candidate of ordered) {
    if (await readGeneration(kind, store, candidate)) {
      valid.add(candidate.generation);
      if (valid.size === 2) break;
    }
  }

  const listedManifests = new Set(
    keys
      .map((key) => generationFromManifestKey(kind, key))
      .filter((generation): generation is string => !!generation),
  );
  const orphanCutoff = Date.now() - checkpointOrphanGraceMs;
  const obsolete = keys.filter((key) => {
    const generation = generationFromCheckpointKey(kind, key);
    if (!generation || valid.has(generation)) return false;
    if (listedManifests.has(generation)) return true;
    const createdAt = checkpointGenerationTime(generation);
    return createdAt === null || createdAt <= orphanCutoff;
  });
  await Promise.all(obsolete.map((key) => store.remove(key)));
}

async function readEventKeys<T extends Content>(
  keys: string[],
  cutoffAt: string | null,
  store: Store,
) {
  const cutoff = cutoffAt ? eventTimeKey(cutoffAt) : "";
  const selected = cutoffAt
    ? keys.filter((key) => eventTimeKeyFromPath(key) >= cutoff)
    : keys;
  return (await mapBounded(selected, (key) => store.get<Event<T>>(key))).filter(
    (event): event is Event<T> => !!event,
  );
}

async function readContentFeedTail(
  kind: Kind,
  cutoffAt: string,
  store: Store,
  onlyRecordId?: string,
): Promise<Event<Content>[] | null> {
  const prefix = contentEventFeedPrefix(kind);
  const marker = `${prefix}${feedHour(cutoffAt)}/`;
  const cutoff = eventTimeKey(cutoffAt);
  const keys = (await store.list(prefix, marker)).filter(
    (key) => key.endsWith(".json") && eventTimeKeyFromPath(key) >= cutoff,
  );
  const rawEntries = await mapBounded(keys, (key) => store.get<unknown>(key));
  const entries: ContentEventFeedEntry[] = [];
  for (const [index, value] of rawEntries.entries()) {
    if (!isFeedEntry(value, kind, keys[index])) return null;
    entries.push(value);
  }

  const relevant = entries.filter(
    (entry) => !onlyRecordId || entry.recordId === onlyRecordId,
  );
  const loaded = await mapBounded(relevant, async (entry) => {
    const key = `${eventPrefix(kind)}/${entry.recordId}/${entry.eventId}.json`;
    return { entry, key, event: await store.get<Event<Content>>(key) };
  });
  const events: Event<Content>[] = [];
  for (const { entry, key, event } of loaded) {
    // Feed-first appends can be interrupted before writing the source event.
    if (event === null) continue;
    if (
      !eventMatchesPath(kind, event, key) ||
      event.id !== entry.eventId ||
      event.at !== entry.at ||
      event.action !== entry.action
    )
      return null;
    events.push(event);
  }
  return events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

async function fullReplay(kind: Kind, store: Store) {
  const keys = await store.list(`${eventPrefix(kind)}/`);
  const groups = eventKeysById(kind, keys);
  return (
    await mapBounded([...groups], ([id, eventKeys]) =>
      stateFromKeys(id, eventKeys, store),
    )
  ).filter((state): state is RecordState<Content> => !!state);
}

function reduceContent<T extends Content>(
  id: string,
  history: Event<T>[],
  initial: RecordState<T> | null = null,
): RecordState<T> | null {
  let draft: T | null = initial?.draft ?? null;
  let published: T | null = initial?.published ?? null;
  let trashed = initial?.trashed ?? false;
  let createdAt = initial?.createdAt ?? "";
  let updatedAt = initial?.updatedAt ?? "";
  let publishedAt: string | null = initial?.publishedAt ?? null;
  let revision = initial?.revision ?? "";
  for (const event of [...history].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    if (event.action === "save") {
      draft = event.data;
      createdAt ||= event.at;
      updatedAt = event.at;
      revision = event.id;
    }
    if (event.action === "publish") {
      published = event.data;
      publishedAt = event.at;
    }
    if (event.action === "unpublish") {
      published = null;
      publishedAt = null;
    }
    if (event.action === "trash") {
      trashed = true;
      published = null;
      publishedAt = null;
    }
    if (event.action === "restore") trashed = false;
  }
  if (!draft) return null;
  return {
    id,
    draft,
    published,
    trashed,
    createdAt,
    updatedAt,
    publishedAt,
    revision,
  };
}

function dashboardArticleFromState(
  state: RecordState<Content>,
): WorkspaceDashboardArticle {
  const draft = state.draft as Article;
  return {
    id: state.id,
    draft: {
      title: draft.title,
      author: draft.author,
      tags: draft.tags,
      articleDate: draft.articleDate,
    },
    published: !!state.published,
    trashed: state.trashed,
    updatedAt: state.updatedAt,
  };
}

function reduceDashboardArticle(
  id: string,
  history: Event<Content>[],
  initial: WorkspaceDashboardArticle | null,
): WorkspaceDashboardArticle | null {
  let draft = initial?.draft ?? null;
  let published = initial?.published ?? false;
  let trashed = initial?.trashed ?? false;
  let updatedAt = initial?.updatedAt ?? "";
  for (const event of [...history].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    if (event.action === "save") {
      const article = event.data as Article;
      draft = {
        title: article.title,
        author: article.author,
        tags: article.tags,
        articleDate: article.articleDate,
      };
      updatedAt = event.at;
    }
    if (event.action === "publish") published = true;
    if (event.action === "unpublish") published = false;
    if (event.action === "trash") {
      trashed = true;
      published = false;
    }
    if (event.action === "restore") trashed = false;
  }
  if (!draft) return null;
  return { id, draft, published, trashed, updatedAt };
}

async function stateFromKeys(
  id: string,
  keys: string[],
  store: Store,
  checkpoint?: CheckpointRow,
) {
  const events = await readEventKeys<Content>(
    keys,
    checkpoint?.cutoffAt ?? null,
    store,
  );
  return reduceContent(id, events, checkpoint?.state ?? null);
}

export async function readContentRecord(kind: Kind, id: string, store: Store) {
  identifier.parse(id);
  const checkpoint = await readCheckpointRecord(kind, id, store);
  if (checkpoint) {
    const tail = await readContentFeedTail(
      kind,
      checkpoint.manifest.cutoffAt,
      store,
      id,
    );
    if (tail) return reduceContent(id, tail, checkpoint.row?.state ?? null);
  }
  const keys = (await store.list(`${eventPrefix(kind)}/${id}/`)).filter((key) =>
    key.endsWith(".json"),
  );
  if (!keys.length) return null;
  return stateFromKeys(id, keys, store);
}

export async function readContentRecords(kind: Kind, store: Store) {
  const checkpoint = await readCompleteGeneration(kind, store);
  if (!checkpoint) return fullReplay(kind, store);
  const tail = await readContentFeedTail(
    kind,
    checkpoint.manifest.cutoffAt,
    store,
  );
  if (!tail) return fullReplay(kind, store);

  const histories = new Map<string, Event<Content>[]>();
  for (const event of tail) {
    const id =
      kind === "articles"
        ? (event.data as Article).slug
        : (event.data as JsonDocument).key;
    const history = histories.get(id) ?? [];
    history.push(event);
    histories.set(id, history);
  }
  const ids = new Set([...checkpoint.rows.keys(), ...histories.keys()]);
  return [...ids]
    .map((id) =>
      reduceContent(
        id,
        histories.get(id) ?? [],
        checkpoint.rows.get(id)?.state ?? null,
      ),
    )
    .filter((state): state is RecordState<Content> => !!state);
}

/** Returns null until a compact checkpoint exists or if its recent feed tail is invalid. */
export async function readWorkspaceDashboardArticles(
  store: Store,
): Promise<WorkspaceDashboardArticle[] | null> {
  const checkpoint = await readCompleteDashboardGeneration(store);
  if (!checkpoint) return null;
  const tail = await readContentFeedTail(
    "articles",
    checkpoint.manifest.cutoffAt,
    store,
  );
  if (!tail) return null;

  const histories = new Map<string, Event<Content>[]>();
  for (const event of tail) {
    const id = (event.data as Article).slug;
    const history = histories.get(id) ?? [];
    history.push(event);
    histories.set(id, history);
  }
  const ids = new Set([...checkpoint.rows.keys(), ...histories.keys()]);
  return [...ids]
    .map((id) =>
      reduceDashboardArticle(
        id,
        histories.get(id) ?? [],
        checkpoint.rows.get(id) ?? null,
      ),
    )
    .filter((state): state is WorkspaceDashboardArticle => !!state);
}

function checkpointRows(
  kind: Kind,
  keys: string[],
  history: Event<Content>[],
  cutoffAt: string,
) {
  const groups = eventKeysById(kind, keys);
  const eventsById = new Map(history.map((event) => [event.id, event]));
  const rows: CheckpointRow[] = [];
  for (const [id, eventKeys] of groups) {
    const recordEvents = eventKeys.flatMap((key) => {
      const eventId = key.slice(key.lastIndexOf("/") + 1, -5);
      const event = eventsById.get(eventId);
      return event && eventFromKey(event, key) ? [event] : [];
    });
    const foldedEvents = recordEvents.filter((event) => event.at < cutoffAt);
    const state = reduceContent(id, foldedEvents);
    if (state && foldedEvents.length)
      rows.push({
        id,
        cursor: foldedEvents.at(-1)!.id,
        cutoffAt,
        state: state as RecordState<Content>,
      });
  }
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function makeShards(kind: Kind, generation: string, rows: CheckpointRow[]) {
  const shards: CheckpointShard[] = [];
  let current: CheckpointRow[] = [];
  const envelope = {
    version: checkpointVersion,
    kind,
    generation,
    rows: [],
  } satisfies CheckpointShard;
  const envelopeBytes = Buffer.byteLength(JSON.stringify(envelope));
  let currentBytes = envelopeBytes;
  for (const row of rows) {
    const rowBytes = Buffer.byteLength(JSON.stringify(row));
    const nextBytes = currentBytes + rowBytes + (current.length ? 1 : 0);
    if (
      current.length &&
      (current.length + 1 > maxShardRows || nextBytes > maxShardBytes)
    ) {
      shards.push({
        version: checkpointVersion,
        kind,
        generation,
        rows: current,
      });
      current = [row];
      currentBytes = envelopeBytes + rowBytes;
    } else {
      current.push(row);
      currentBytes = nextBytes;
    }
  }
  if (current.length)
    shards.push({
      version: checkpointVersion,
      kind,
      generation,
      rows: current,
    });
  return shards;
}

function makeDashboardShards(
  generation: string,
  rows: WorkspaceDashboardArticle[],
) {
  const shards: DashboardCheckpointShard[] = [];
  let current: WorkspaceDashboardArticle[] = [];
  const envelope = {
    version: 1,
    kind: "articles",
    generation,
    rows: [],
  } satisfies DashboardCheckpointShard;
  const envelopeBytes = Buffer.byteLength(JSON.stringify(envelope));
  let currentBytes = envelopeBytes;
  for (const row of rows) {
    const rowBytes = Buffer.byteLength(JSON.stringify(row));
    const nextBytes = currentBytes + rowBytes + (current.length ? 1 : 0);
    if (
      current.length &&
      (current.length + 1 > maxShardRows || nextBytes > maxShardBytes)
    ) {
      shards.push({
        version: 1,
        kind: "articles",
        generation,
        rows: current,
      });
      current = [row];
      currentBytes = envelopeBytes + rowBytes;
    } else {
      current.push(row);
      currentBytes = nextBytes;
    }
  }
  if (current.length)
    shards.push({
      version: 1,
      kind: "articles",
      generation,
      rows: current,
    });
  return shards;
}

function sourceKeyGroupsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const right = new Set(b);
  return a.every((key) => right.has(key));
}

export interface ContentIndexStatus {
  indexedThrough: string | null;
  unindexedEvents: number | null;
  valid: boolean;
}

export async function contentIndexStatus(
  kind: Kind,
  store: Store,
): Promise<ContentIndexStatus> {
  const checkpoint = await readCompleteGeneration(kind, store);
  if (!checkpoint) {
    const sourceKeys = (await store.list(`${eventPrefix(kind)}/`)).filter(
      (key) => key.endsWith(".json"),
    );
    return {
      indexedThrough: null,
      unindexedEvents: sourceKeys.length,
      valid: true,
    };
  }
  const tail = await readContentFeedTail(
    kind,
    checkpoint.manifest.cutoffAt,
    store,
  );
  return {
    indexedThrough: checkpoint.manifest.cutoffAt,
    unindexedEvents: tail?.length ?? null,
    valid: tail !== null,
  };
}

/** Builds a derived checkpoint without changing the immutable source event log. */
export async function rebuildContentCheckpoints(
  kind: Kind,
  store: Store,
): Promise<CheckpointBuildResult> {
  let failure: CheckpointBuildResult["failure"] = "source-changed";
  for (let attempt = 0; attempt <= checkpointRetries; attempt++) {
    // The overlap keeps in-flight writes and small clock skew in the replay tail.
    const cutoffAt = new Date(Date.now() - snapshotOverlapMs).toISOString();
    const sourcePrefix = `${eventPrefix(kind)}/`;
    const sourceKeys = (await store.list(sourcePrefix)).filter((key) =>
      key.endsWith(".json"),
    );
    const allEvents = (
      await mapBounded(sourceKeys, (key) => store.get<Event<Content>>(key))
    ).filter((event): event is Event<Content> => !!event);
    if (
      allEvents.length !== sourceKeys.length ||
      sourceKeys.some(
        (key, index) => !eventMatchesPath(kind, allEvents[index], key),
      )
    ) {
      failure = "source-unavailable";
      continue;
    }
    const confirmKeys = (await store.list(sourcePrefix)).filter((key) =>
      key.endsWith(".json"),
    );
    if (!sourceKeyGroupsEqual(sourceKeys, confirmKeys)) {
      failure = "source-changed";
      continue;
    }

    const rows = checkpointRows(kind, sourceKeys, allEvents, cutoffAt);
    const dashboardRows =
      kind === "articles"
        ? rows.map((row) => dashboardArticleFromState(row.state))
        : [];
    await mapBounded(
      sourceKeys.map((key, index) => ({ key, event: allEvents[index] })),
      async ({ key, event }) => {
        const recordId = key.split("/").at(-2)!;
        const entry: ContentEventFeedEntry = {
          version: 1,
          kind,
          recordId,
          eventId: event.id,
          at: event.at,
          action: event.action,
        };
        const feedKey = contentEventFeedKey(kind, event.at, event.id);
        const existing = await store.get<unknown>(feedKey);
        if (
          !isFeedEntry(existing, kind, feedKey) ||
          existing.recordId !== recordId ||
          existing.at !== event.at ||
          existing.action !== event.action
        )
          await store.put(feedKey, entry);
      },
    );

    const generation = await nextCheckpointGeneration(kind, store);
    const shards = makeShards(kind, generation, rows);
    const dashboardShards =
      kind === "articles" ? makeDashboardShards(generation, dashboardRows) : [];
    if (
      shards.some(
        (shard) =>
          shard.rows.length > maxShardRows ||
          Buffer.byteLength(JSON.stringify(shard)) > maxShardBytes,
      ) ||
      dashboardShards.some(
        (shard) =>
          shard.rows.length > maxShardRows ||
          Buffer.byteLength(JSON.stringify(shard)) > maxShardBytes,
      )
    )
      return {
        generation: null,
        records: 0,
        shards: 0,
        retries: attempt,
        complete: false,
        failure: "record-too-large",
      };
    const base = `${checkpointPrefix(kind)}/${generation}`;
    const descriptors: CheckpointManifest["shards"] = [];
    const dashboardDescriptors: DashboardShardDescriptor[] = [];
    for (const [index, shard] of shards.entries()) {
      const key = `${base}/shard-${String(index).padStart(5, "0")}.json`;
      const serialized = JSON.stringify(shard);
      const bytes = Buffer.byteLength(serialized);
      await store.put(key, shard);
      descriptors.push({
        key,
        firstId: shard.rows[0].id,
        lastId: shard.rows.at(-1)!.id,
        rows: shard.rows.length,
        bytes,
        sha256: sha256(serialized),
      });
    }
    for (const [index, shard] of dashboardShards.entries()) {
      const key = `${base}/dashboard-shard-${String(index).padStart(5, "0")}.json`;
      const serialized = JSON.stringify(shard);
      const bytes = Buffer.byteLength(serialized);
      await store.put(key, shard);
      dashboardDescriptors.push({
        key,
        firstId: shard.rows[0].id,
        lastId: shard.rows.at(-1)!.id,
        rows: shard.rows.length,
        bytes,
        sha256: sha256(serialized),
      });
    }

    // Events written during the read or shard write invalidate this generation.
    const finalKeys = (await store.list(sourcePrefix)).filter((key) =>
      key.endsWith(".json"),
    );
    if (!sourceKeyGroupsEqual(sourceKeys, finalKeys)) {
      await Promise.all(
        [...descriptors, ...dashboardDescriptors].map(({ key }) =>
          store.remove(key),
        ),
      );
      failure = "source-changed";
      continue;
    }

    const tail = await readContentFeedTail(kind, cutoffAt, store);
    if (!tail) {
      failure = "checkpoint-invalid";
      continue;
    }

    const manifest: CheckpointManifest = {
      version: checkpointVersion,
      kind,
      generation,
      cutoffAt,
      records: rows.length,
      indexedEvents: allEvents.filter((event) => event.at < cutoffAt).length,
      shards: descriptors,
      ...(kind === "articles" ? { dashboardShards: dashboardDescriptors } : {}),
    };
    await store.put(`${base}/manifest.json`, manifest);
    const candidate = { key: `${base}/manifest.json`, generation };
    const dashboardGeneration =
      kind === "articles" ? await readCompleteDashboardGeneration(store) : null;
    if (
      !(await readGeneration(kind, store, candidate)) ||
      (kind === "articles" &&
        dashboardGeneration?.manifest.generation !== generation)
    )
      return {
        generation: null,
        records: 0,
        shards: 0,
        retries: attempt,
        complete: false,
        failure: "checkpoint-invalid",
      };
    await pruneCheckpointGenerations(kind, store, generation);
    return {
      generation,
      records: descriptors.reduce((count, shard) => count + shard.rows, 0),
      shards: descriptors.length,
      retries: attempt,
      complete: true,
      indexedEvents: manifest.indexedEvents,
      unindexedEvents: tail.length,
    };
  }
  return {
    generation: null,
    records: 0,
    shards: 0,
    retries: checkpointRetries,
    complete: false,
    failure,
  };
}
