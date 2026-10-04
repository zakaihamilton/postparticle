import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listPublicArticles, readPublicArticle } from "../src/lib/public";
import { LocalStore } from "../src/lib/storage";
import { records } from "../src/lib/content";
import { rebuildContentCheckpoints } from "../src/lib/content-state";
import type { Article, Event } from "../src/lib/types";

class CountingStore extends LocalStore {
  gets = 0;
  lists = 0;
  listedKeys = 0;
  listSizes: number[] = [];

  override async get<T>(key: string) {
    this.gets++;
    return super.get<T>(key);
  }

  override async list(prefix: string) {
    this.lists++;
    const keys = await super.list(prefix);
    this.listedKeys += keys.length;
    this.listSizes.push(keys.length);
    return keys;
  }

  reset() {
    this.gets = 0;
    this.lists = 0;
    this.listedKeys = 0;
    this.listSizes = [];
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
    estimatedSpacesListPages: store.listSizes.reduce(
      (total, keyCount) => total + Math.max(1, Math.ceil(keyCount / 1000)),
      0,
    ),
  };
}

const root = await mkdtemp(
  path.join(tmpdir(), "postparticle-checkpoint-bench-"),
);
try {
  const store = new CountingStore("benchmark", root);
  const base = Date.UTC(2025, 0, 1);
  for (let index = 0; index < 1000; index++) {
    const slug = article(index, 0).slug;
    for (let revision = 0; revision < 10; revision++) {
      const data = article(index, revision);
      const at = new Date(base + (index * 10 + revision) * 1000).toISOString();
      const id = `${at.replace(/[:.]/g, "-")}_${randomUUID()}`;
      const event: Event<Article> = {
        id,
        at,
        actor: "benchmark",
        action: revision === 9 ? "publish" : "save",
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

  const built = await rebuildContentCheckpoints("articles", store);
  assert.equal(built.complete, true, "checkpoint generation should complete");
  const manifest = await store.get<{
    records: number;
    shards: { rows: number; bytes: number }[];
  }>(`checkpoints/content/articles/${built.generation}/manifest.json`);
  assert.ok(manifest);
  assert.equal(manifest.records, 1000);
  for (const shard of manifest.shards) {
    assert.ok(shard.rows <= 1000, "checkpoint shard exceeded the row cap");
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

  console.log(
    JSON.stringify(
      {
        fixture: { historicalEvents: 10_000, currentRecords: 1_000 },
        checkpoint: {
          generation: built.generation,
          shards: built.shards,
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
        note: "The local adapter enumerates every matching key. keysEnumerated makes that remaining history-scan cost visible; it does not simulate Spaces page latency.",
      },
      null,
      2,
    ),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
