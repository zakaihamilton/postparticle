import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listPublicArticles, readPublicArticle } from "../src/lib/public";
import { LocalStore } from "../src/lib/storage";
import { records } from "../src/lib/content";
import {
  contentIndexStatus,
  rebuildContentCheckpoints,
} from "../src/lib/content-state";
import { append } from "../src/lib/events";
import type { Article, Event } from "../src/lib/types";

class CountingStore extends LocalStore {
  gets = 0;
  lists = 0;
  listedKeys = 0;
  listSizes: number[] = [];
  listedPrefixes: string[] = [];

  override async get<T>(key: string) {
    this.gets++;
    return super.get<T>(key);
  }

  override async list(prefix: string, marker?: string) {
    this.lists++;
    this.listedPrefixes.push(prefix);
    const keys = await super.list(prefix, marker);
    this.listedKeys += keys.length;
    this.listSizes.push(keys.length);
    return keys;
  }

  reset() {
    this.gets = 0;
    this.lists = 0;
    this.listedKeys = 0;
    this.listSizes = [];
    this.listedPrefixes = [];
  }
}

const article = (index: number, revision: number): Article => ({
  title: `Benchmark story ${index} revision ${revision}`,
  slug: `story-${String(index).padStart(4, "0")}`,
  excerpt: "Synthetic content used to measure checkpoint reads.",
  body: "A repeatable benchmark body. ".repeat(10),
  author: "Benchmark",
  tags: ["benchmark"],
  articleDate: "2025-01-01",
  coverMediaId: "",
  seoTitle: "",
  seoDescription: "",
  socialMediaId: "",
});

function metrics(store: CountingStore, started: number) {
  return {
    elapsedMs: Number((performance.now() - started).toFixed(1)),
    objectGets: store.gets,
    listCalls: store.lists,
    keysEnumerated: store.listedKeys,
    keyCountsPerList: [...store.listSizes],
    estimatedSpacesListPages: store.listSizes.reduce(
      (total, keyCount) => total + Math.max(1, Math.ceil(keyCount / 1000)),
      0,
    ),
  };
}

async function benchmarkSize(recordsCount: number, revisionsPerRecord: number) {
  const root = await mkdtemp(
    path.join(tmpdir(), "postparticle-checkpoint-bench-"),
  );
  try {
    const store = new CountingStore("benchmark", root);
    const base = Date.UTC(2025, 0, 1);
    for (let index = 0; index < recordsCount; index++) {
      const slug = article(index, 0).slug;
      for (let revision = 0; revision < revisionsPerRecord; revision++) {
        const data = article(index, revision);
        const at = new Date(
          base + (index * revisionsPerRecord + revision) * 1000,
        ).toISOString();
        const id = `${at.replace(/[:.]/g, "-")}_${randomUUID()}`;
        const event: Event<Article> = {
          id,
          at,
          actor: "benchmark",
          action: revision === revisionsPerRecord - 1 ? "publish" : "save",
          data,
        };
        await store.put(`content/articles/${slug}/${id}.json`, event);
      }
    }

    let started = performance.now();
    const baseline = await records("articles", store);
    const baselineMetrics = metrics(store, started);
    store.reset();
    started = performance.now();
    const baselinePublic = await listPublicArticles(
      "demo",
      { pageSize: "12" },
      store,
    );
    const baselinePublicMetrics = metrics(store, started);

    store.reset();
    started = performance.now();
    const baselinePublicArticle = await readPublicArticle(
      "demo",
      "story-0000",
      store,
    );
    const baselinePublicArticleMetrics = metrics(store, started);

    started = performance.now();
    const built = await rebuildContentCheckpoints("articles", store);
    const checkpointBuildMs = Number((performance.now() - started).toFixed(1));
    assert.equal(built.complete, true, "checkpoint generation should complete");
    const manifest = await store.get<{
      records: number;
      shards: { rows: number; bytes: number }[];
    }>(`checkpoints/content/articles/${built.generation}/manifest.json`);
    assert.ok(manifest);
    assert.equal(manifest.records, recordsCount);
    for (const shard of manifest.shards) {
      assert.ok(shard.rows <= 200, "checkpoint shard exceeded the row cap");
      assert.ok(
        shard.bytes <= 4 * 1024 * 1024,
        "checkpoint shard exceeded 4 MiB",
      );
    }

    store.reset();
    started = performance.now();
    const checkpointed = await records("articles", store);
    const checkpointMetrics = metrics(store, started);
    assert.deepEqual(checkpointed, baseline);
    assert.ok(
      checkpointMetrics.objectGets < baselineMetrics.objectGets / 5,
      `expected fewer than one fifth as many object reads (${checkpointMetrics.objectGets} vs ${baselineMetrics.objectGets})`,
    );
    assert.ok(
      !store.listedPrefixes.includes("content/articles/"),
      "indexed listing must not enumerate historical content-event keys",
    );

    store.reset();
    started = performance.now();
    const checkpointedPublic = await listPublicArticles(
      "demo",
      { pageSize: "12" },
      store,
    );
    const checkpointPublicMetrics = metrics(store, started);
    assert.deepEqual(checkpointedPublic, baselinePublic);

    store.reset();
    started = performance.now();
    const checkpointedPublicArticle = await readPublicArticle(
      "demo",
      "story-0000",
      store,
    );
    const checkpointedPublicArticleMetrics = metrics(store, started);
    assert.deepEqual(checkpointedPublicArticle, baselinePublicArticle);
    assert.ok(
      checkpointedPublicArticleMetrics.objectGets <
        baselinePublicArticleMetrics.objectGets,
      "single article lookup should fetch fewer event bodies after checkpointing",
    );

    await Promise.all([
      append(
        store,
        "content/articles/story-0000",
        "benchmark-writer-a",
        "save",
        article(0, revisionsPerRecord + 1),
      ),
      append(
        store,
        "content/articles/story-0001",
        "benchmark-writer-b",
        "save",
        article(1, revisionsPerRecord + 1),
      ),
    ]);
    const tailStatus = await contentIndexStatus("articles", store);
    assert.equal(tailStatus.valid, true);
    assert.equal(tailStatus.unindexedEvents, 2);
    store.reset();
    started = performance.now();
    const concurrentFullReplay = await records("articles", store);
    const concurrentFullReplayMetrics = metrics(store, started);
    store.reset();
    started = performance.now();
    const concurrentIndexed = await records("articles", store);
    const concurrentIndexedMetrics = metrics(store, started);
    assert.deepEqual(concurrentIndexed, concurrentFullReplay);
    assert.ok(
      !store.listedPrefixes.includes("content/articles/"),
      "indexed reads after concurrent writes must avoid the historical event prefix",
    );

    return {
      fixture: {
        historicalEvents: recordsCount * revisionsPerRecord,
        currentRecords: recordsCount,
        revisionsPerRecord,
      },
      checkpoint: {
        buildElapsedMs: checkpointBuildMs,
        shards: built.shards,
        unindexedTailAfterBuild: built.unindexedEvents,
      },
      recordListing: {
        fullReplay: baselineMetrics,
        checkpointed: checkpointMetrics,
      },
      publicArticleListing: {
        fullReplay: baselinePublicMetrics,
        checkpointed: checkpointPublicMetrics,
      },
      publicArticleLookup: {
        fullReplay: baselinePublicArticleMetrics,
        checkpointed: checkpointedPublicArticleMetrics,
      },
      concurrentWrites: {
        unindexedTail: tailStatus.unindexedEvents,
        fullReplay: concurrentFullReplayMetrics,
        indexed: concurrentIndexedMetrics,
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const scenarios = [
  { records: 100, revisions: 10 },
  { records: 500, revisions: 10 },
  { records: 1000, revisions: 10 },
];
const results = [];
for (const scenario of scenarios)
  results.push(await benchmarkSize(scenario.records, scenario.revisions));

console.log(
  JSON.stringify(
    {
      scenarios: results,
      note: "Fixtures contain 1,000, 5,000, and 10,000 historical events. Indexed reads must enumerate checkpoint shards and the recent feed tail, not historical content-event keys. Local timings do not simulate remote Spaces latency.",
    },
    null,
    2,
  ),
);
