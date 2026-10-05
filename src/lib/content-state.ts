import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { identifier } from "./config";
import { mapBounded, type Store } from "./storage";
import type {
  Article,
  Content,
  Event,
  JsonDocument,
  Kind,
  RecordState,
} from "./types";

const checkpointVersion = 1;
const maxShardBytes = 4 * 1024 * 1024;
const maxShardRows = 1000;
const checkpointRetries = 2;
const checkpointOrphanGraceMs = 24 * 60 * 60 * 1000;

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

interface CheckpointManifest {
  version: number;
  kind: Kind;
  generation: string;
  records: number;
  shards: Array<{
    key: string;
    firstId: string;
    lastId: string;
    rows: number;
    bytes: number;
    sha256: string;
  }>;
}

export interface CheckpointBuildResult {
  generation: string | null;
  records: number;
  shards: number;
  retries: number;
  complete: boolean;
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

function isManifest(
  value: unknown,
  kind: Kind,
  generation: string,
): value is CheckpointManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<CheckpointManifest>;
  return (
    manifest.version === checkpointVersion &&
    manifest.kind === kind &&
    manifest.generation === generation &&
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
      manifest.records
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

async function readCompleteGeneration(kind: Kind, store: Store) {
  for (const candidate of await checkpointManifests(kind, store)) {
    const generation = await readGeneration(kind, store, candidate);
    if (generation) return generation;
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

async function readCheckpointRow(kind: Kind, id: string, store: Store) {
  for (const candidate of await checkpointManifests(kind, store)) {
    const manifest = await readManifest(kind, store, candidate);
    if (!manifest) continue;
    const descriptor = manifest.shards.find(
      (shard) => id >= shard.firstId && id <= shard.lastId,
    );
    if (!descriptor) return null;
    const rows = await readShard(kind, manifest, descriptor, store);
    if (!rows) continue;
    return rows.find((row) => row.id === id) ?? null;
  }
  return null;
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
  const keys = (await store.list(`${eventPrefix(kind)}/${id}/`)).filter((key) =>
    key.endsWith(".json"),
  );
  if (!keys.length) return null;
  const checkpoint = await readCheckpointRow(kind, id, store);
  return stateFromKeys(id, keys, store, checkpoint ?? undefined);
}

export async function readContentRecords(kind: Kind, store: Store) {
  const keys = await store.list(`${eventPrefix(kind)}/`);
  const groups = eventKeysById(kind, keys);
  const checkpoint = await readCompleteGeneration(kind, store);
  return (
    await mapBounded([...groups], ([id, eventKeys]) =>
      stateFromKeys(id, eventKeys, store, checkpoint?.rows.get(id)),
    )
  ).filter((state): state is RecordState<Content> => !!state);
}

function checkpointRows(kind: Kind, keys: string[], history: Event<Content>[]) {
  const groups = eventKeysById(kind, keys);
  const eventsById = new Map(history.map((event) => [event.id, event]));
  const rows: CheckpointRow[] = [];
  for (const [id, eventKeys] of groups) {
    const recordEvents = eventKeys.flatMap((key) => {
      const eventId = key.slice(key.lastIndexOf("/") + 1, -5);
      const event = eventsById.get(eventId);
      return event && eventFromKey(event, key) ? [event] : [];
    });
    if (!recordEvents.length) continue;
    const cutoffAt = recordEvents.reduce(
      (latest, event) => (event.at > latest ? event.at : latest),
      "",
    );
    const foldedEvents = recordEvents.filter((event) => event.at < cutoffAt);
    const state = reduceContent(id, foldedEvents);
    if (state)
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

function sourceKeyGroupsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const right = new Set(b);
  return a.every((key) => right.has(key));
}

/** Builds a derived checkpoint without changing the immutable source event log. */
export async function rebuildContentCheckpoints(
  kind: Kind,
  store: Store,
): Promise<CheckpointBuildResult> {
  let failure: CheckpointBuildResult["failure"] = "source-changed";
  for (let attempt = 0; attempt <= checkpointRetries; attempt++) {
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

    const rows = checkpointRows(kind, sourceKeys, allEvents);
    if (!rows.length)
      return {
        generation: null,
        records: 0,
        shards: 0,
        retries: attempt,
        complete: true,
      };

    const generation = `${Date.now().toString().padStart(13, "0")}-${randomUUID()}`;
    const shards = makeShards(kind, generation, rows);
    if (
      shards.some(
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

    // Events written during the read or shard write invalidate this generation.
    const finalKeys = (await store.list(sourcePrefix)).filter((key) =>
      key.endsWith(".json"),
    );
    if (!sourceKeyGroupsEqual(sourceKeys, finalKeys)) {
      await Promise.all(descriptors.map(({ key }) => store.remove(key)));
      failure = "source-changed";
      continue;
    }

    const manifest: CheckpointManifest = {
      version: checkpointVersion,
      kind,
      generation,
      records: rows.length,
      shards: descriptors,
    };
    await store.put(`${base}/manifest.json`, manifest);
    const candidate = { key: `${base}/manifest.json`, generation };
    if (!(await readGeneration(kind, store, candidate)))
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
