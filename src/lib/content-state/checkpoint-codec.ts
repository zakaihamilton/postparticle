import "server-only";
import { createHash } from "node:crypto";
import type { Store } from "../storage";
import type {
  Content,
  Kind,
  RecordState,
  WorkspaceDashboardArticle,
} from "../types";

export const checkpointVersion = 2;
export const maxShardBytes = 4 * 1024 * 1024;
export const maxShardRows = 200;

export interface CheckpointRow {
  id: string;
  /** Last source event folded into state. */
  cursor: string;
  /** Events at this instant stay in the replay tail to preserve concurrent tie ordering. */
  cutoffAt: string;
  state: RecordState<Content>;
}

export interface ShardEnvelope<T, K extends Kind = Kind> {
  version: number;
  kind: K;
  generation: string;
  rows: T[];
}

export interface ShardDescriptor {
  key: string;
  firstId: string;
  lastId: string;
  rows: number;
  bytes: number;
  sha256: string;
}

export interface CheckpointManifest {
  version: number;
  kind: Kind;
  generation: string;
  /** Events before this UTC instant are folded into the snapshot. */
  cutoffAt: string;
  records: number;
  indexedEvents: number;
  shards: ShardDescriptor[];
  /** Compact article rows used by the workspace overview. */
  dashboardShards?: ShardDescriptor[];
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

export interface ContentIndexStatus {
  indexedThrough: string | null;
  unindexedEvents: number | null;
  valid: boolean;
}

export function checkpointPrefix(kind: Kind) {
  return `checkpoints/content/${kind}`;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function generationFromManifestKey(kind: Kind, key: string) {
  const prefix = `${checkpointPrefix(kind)}/`;
  if (!key.startsWith(prefix) || !key.endsWith("/manifest.json")) return null;
  const generation = key.slice(prefix.length, -"/manifest.json".length);
  return generation && !generation.includes("/") ? generation : null;
}

export function generationFromCheckpointKey(kind: Kind, key: string) {
  const prefix = `${checkpointPrefix(kind)}/`;
  if (!key.startsWith(prefix)) return null;
  const generation = key.slice(prefix.length).split("/", 1)[0];
  return generation || null;
}

export function checkpointGenerationTime(generation: string) {
  const match = /^(\d{13})-/.exec(generation);
  return match ? Number(match[1]) : null;
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

export function isCheckpointRow(value: unknown): value is CheckpointRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CheckpointRow>;
  return (
    typeof row.id === "string" &&
    typeof row.cursor === "string" &&
    Number.isFinite(Date.parse(row.cutoffAt ?? "")) &&
    stateFromUnknown(row.state, row.id)
  );
}

export function isDashboardArticle(
  value: unknown,
): value is WorkspaceDashboardArticle {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<WorkspaceDashboardArticle>;
  const draft = row.draft as
    | Partial<WorkspaceDashboardArticle["draft"]>
    | undefined;
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

function hasValidShardDescriptors(
  shards: unknown,
  keyPrefix: string,
  totalRecords: number | undefined,
): shards is ShardDescriptor[] {
  return (
    Array.isArray(shards) &&
    shards.every(
      (shard, index) =>
        !!shard &&
        shard.key === `${keyPrefix}${String(index).padStart(5, "0")}.json` &&
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
    shards.reduce((count, shard) => count + shard.rows, 0) === totalRecords
  );
}

export function isManifest(
  value: unknown,
  kind: Kind,
  generation: string,
): value is CheckpointManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<CheckpointManifest>;
  const base = `${checkpointPrefix(kind)}/${generation}`;
  const dashboardShardsValid =
    manifest.dashboardShards === undefined ||
    (kind === "articles" &&
      hasValidShardDescriptors(
        manifest.dashboardShards,
        `${base}/dashboard-shard-`,
        manifest.records,
      ));
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
    hasValidShardDescriptors(
      manifest.shards,
      `${base}/shard-`,
      manifest.records,
    ) &&
    dashboardShardsValid
  );
}

export function packShards<T, K extends Kind = Kind>(
  envelopeBase: { version: number; kind: K; generation: string },
  rows: T[],
): ShardEnvelope<T, K>[] {
  const shards: ShardEnvelope<T, K>[] = [];
  let current: T[] = [];
  const envelope: ShardEnvelope<T, K> = { ...envelopeBase, rows: [] };
  const envelopeBytes = Buffer.byteLength(JSON.stringify(envelope));
  let currentBytes = envelopeBytes;
  for (const row of rows) {
    const rowBytes = Buffer.byteLength(JSON.stringify(row));
    const nextBytes = currentBytes + rowBytes + (current.length ? 1 : 0);
    if (
      current.length &&
      (current.length + 1 > maxShardRows || nextBytes > maxShardBytes)
    ) {
      shards.push({ ...envelopeBase, rows: current });
      current = [row];
      currentBytes = envelopeBytes + rowBytes;
    } else {
      current.push(row);
      currentBytes = nextBytes;
    }
  }
  if (current.length) shards.push({ ...envelopeBase, rows: current });
  return shards;
}

export async function readVerifiedShard<T extends { id: string }>(
  options: {
    version: number;
    kind: Kind;
    generation: string;
    isRow: (value: unknown) => value is T;
  },
  descriptor: ShardDescriptor,
  store: Store,
): Promise<T[] | null> {
  let value: unknown;
  try {
    value = await store.get<unknown>(descriptor.key);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (!value || typeof value !== "object") return null;
  const shard = value as Partial<ShardEnvelope<T>>;
  if (
    shard.version !== options.version ||
    shard.kind !== options.kind ||
    shard.generation !== options.generation ||
    !Array.isArray(shard.rows) ||
    shard.rows.length !== descriptor.rows ||
    !shard.rows.every(options.isRow)
  )
    return null;
  const serialized = JSON.stringify(value);
  if (
    Buffer.byteLength(serialized) !== descriptor.bytes ||
    sha256(serialized) !== descriptor.sha256
  )
    return null;
  const rows = shard.rows as T[];
  if (
    rows[0]?.id !== descriptor.firstId ||
    rows.at(-1)?.id !== descriptor.lastId ||
    rows.some((row, index) => index > 0 && rows[index - 1].id >= row.id)
  )
    return null;
  return rows;
}
