import "server-only";
import { randomUUID } from "node:crypto";
import { type ContentEventFeedEntry, contentEventFeedKey } from "../events";
import { mapBounded, type Store } from "../storage";
import type { Content, Event, Kind, RecordState } from "../types";
import {
  type CheckpointBuildResult,
  type CheckpointManifest,
  type CheckpointRow,
  checkpointGenerationTime,
  checkpointPrefix,
  checkpointVersion,
  generationFromCheckpointKey,
  generationFromManifestKey,
  maxShardBytes,
  maxShardRows,
  packShards,
  type ShardDescriptor,
  type ShardEnvelope,
  sha256,
} from "./checkpoint-codec";
import {
  readCompleteDashboardGeneration,
  readContentFeedTail,
  readGeneration,
} from "./checkpoint-reader";
import {
  dashboardArticleFromState,
  eventFromKey,
  eventKeysById,
  eventMatchesPath,
  eventPrefix,
  isFeedEntry,
  reduceContent,
} from "./reducers";

const checkpointRetries = 2;
const checkpointOrphanGraceMs = 24 * 60 * 60 * 1000;
const snapshotOverlapMs = 60 * 1000;

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

function sourceKeyGroupsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const right = new Set(b);
  return a.every((key) => right.has(key));
}

async function writeShardEnvelopes<T extends { id: string }>(
  shards: ShardEnvelope<T>[],
  keyPrefix: string,
  store: Store,
): Promise<ShardDescriptor[]> {
  const descriptors: ShardDescriptor[] = [];
  for (const [index, shard] of shards.entries()) {
    const key = `${keyPrefix}${String(index).padStart(5, "0")}.json`;
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
  return descriptors;
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
    const shards = packShards({ version: checkpointVersion, kind, generation }, rows);
    const dashboardShards =
      kind === "articles"
        ? packShards({ version: 1, kind: "articles", generation }, dashboardRows)
        : [];
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
    const descriptors = await writeShardEnvelopes(shards, `${base}/shard-`, store);
    const dashboardDescriptors = await writeShardEnvelopes(
      dashboardShards,
      `${base}/dashboard-shard-`,
      store,
    );

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
