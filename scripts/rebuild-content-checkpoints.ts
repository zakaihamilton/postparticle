import { identifier, projectById } from "../src/lib/config";
import { rebuildContentCheckpoints } from "../src/lib/content-state";
import { projectStore } from "../src/lib/storage";

const rawProjectId = process.argv[2];
if (!rawProjectId)
  throw new Error("Usage: npm run storage:checkpoint -- <project-id>");

const projectId = identifier.parse(rawProjectId);
projectById(projectId);
const store = projectStore(projectId);

for (const kind of ["articles", "documents"] as const) {
  const result = await rebuildContentCheckpoints(kind, store);
  if (!result.complete) {
    const explanation =
      result.failure === "record-too-large"
        ? "a record exceeds the 4 MiB checkpoint shard limit"
        : result.failure === "checkpoint-invalid"
          ? "the newly written checkpoint did not pass read-back validation; older generations were preserved"
          : result.failure === "source-unavailable"
            ? "one or more listed source events could not be read consistently"
            : "the source event list changed during checkpoint generation";
    console.error(
      `${projectId}/${kind}: ${explanation} after ${result.retries} retries; no checkpoint was published. Retry during a quieter period.`,
    );
    process.exitCode = 1;
    continue;
  }
  console.log(
    `${projectId}/${kind}: ${result.records} records in ${result.shards} shards` +
      (result.generation ? ` (generation ${result.generation})` : " (empty)"),
  );
}
