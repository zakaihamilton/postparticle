import { performance } from "node:perf_hooks";
import registry from "../projects.json";
import { identifier } from "../src/lib/config";
import { records } from "../src/lib/content";
import { listPublicArticles, readPublicArticle } from "../src/lib/public";
import { projectStore, type Store } from "../src/lib/storage";

const args = process.argv.slice(2);
const projectId = args.find((arg) => !arg.startsWith("--"));
if (!projectId || !args.includes("--confirm-non-production"))
  throw new Error(
    "Usage: npm run storage:measure -- <non-production-project-id> --confirm-non-production",
  );
if (process.env.STORAGE_DRIVER !== "spaces")
  throw new Error("Measurement requires STORAGE_DRIVER=spaces");
if (process.env.VERCEL_ENV === "production")
  throw new Error("Refusing to measure from a production deployment");

const parsedProjectId = identifier.parse(projectId);
if (
  !registry.some(
    (project) => project.id === parsedProjectId && project.production === false,
  )
)
  throw new Error(
    "Choose a project explicitly marked production:false in projects.json",
  );

const target = projectStore(parsedProjectId);
const stats = {
  gets: 0,
  listCalls: 0,
  listedKeys: 0,
  listSizes: [] as number[],
};
const store = new Proxy(target, {
  get(storeTarget, property) {
    if (property === "get")
      return async (key: string) => {
        stats.gets++;
        return storeTarget.get(key);
      };
    if (property === "list")
      return async (prefix: string) => {
        stats.listCalls++;
        const keys = await storeTarget.list(prefix);
        stats.listedKeys += keys.length;
        stats.listSizes.push(keys.length);
        return keys;
      };
    const value = Reflect.get(storeTarget, property, storeTarget);
    return typeof value === "function" ? value.bind(storeTarget) : value;
  },
}) as Store;

function reset() {
  stats.gets = 0;
  stats.listCalls = 0;
  stats.listedKeys = 0;
  stats.listSizes = [];
}

async function measure<T>(operation: () => Promise<T>) {
  reset();
  const started = performance.now();
  const value = await operation();
  const elapsedMs = Number((performance.now() - started).toFixed(1));
  return {
    value,
    metrics: {
      elapsedMs,
      objectGets: stats.gets,
      listCalls: stats.listCalls,
      keysEnumerated: stats.listedKeys,
      keyCountsPerList: [...stats.listSizes],
      estimatedSpacesListPages: stats.listSizes.reduce(
        (total, keyCount) => total + Math.max(1, Math.ceil(keyCount / 1000)),
        0,
      ),
    },
  };
}

const recordListing = await measure(() => records("articles", store));
const publicListing = await measure(() =>
  listPublicArticles(parsedProjectId, { pageSize: "12" }, store),
);
const firstPublished = publicListing.value.items[0];
const singleArticle = firstPublished
  ? await measure(() =>
      readPublicArticle(parsedProjectId, firstPublished.slug, store),
    )
  : null;

console.log(
  JSON.stringify(
    {
      project: parsedProjectId,
      measurements: {
        recordListing: {
          recordCount: recordListing.value.length,
          ...recordListing.metrics,
        },
        publicArticleListing: {
          articleCount: publicListing.value.total,
          ...publicListing.metrics,
        },
        publicArticleLookup:
          singleArticle?.metrics ?? "skipped: no published articles",
      },
      note: "Read-only measurements. Page counts are estimated from 1,000-key Spaces pages; local key enumeration and network timings are not included.",
    },
    null,
    2,
  ),
);
