import { randomUUID } from "node:crypto";
import {
  identifier,
  legacyOrganizationIdForProject,
  organizationIdentifier,
  projects,
} from "../src/lib/config";
import { SpacesStore } from "../src/lib/storage";
if (process.env.STORAGE_DRIVER !== "spaces")
  throw new Error(
    "Verification requires STORAGE_DRIVER=spaces and real Spaces credentials",
  );
if (projects.length === 0) throw new Error("Configure at least one project");
const args = process.argv.slice(2);
const organizationOption = args.indexOf("--organization-id");
const rawOrganizationId = organizationOption >= 0 ? args[organizationOption + 1] : undefined;
if (organizationOption >= 0 && !rawOrganizationId)
  throw new Error(
    'Usage: npm run storage:verify -- [project-id] [--organization-id "<organization-uuid>"]',
  );
const rawProjectId = args.find(
  (arg, index) =>
    !arg.startsWith("--") &&
    (organizationOption < 0 || index !== organizationOption + 1),
);
const projectId = rawProjectId ? identifier.parse(rawProjectId) : projects[0].id;
const organizationId = rawOrganizationId
  ? organizationIdentifier.parse(rawOrganizationId).toLowerCase()
  : undefined;
if (!organizationId && !legacyOrganizationIdForProject(projectId))
  throw new Error("Organization ID is required for this project");
for (const prefix of ["CONTROL", "CONTENT"]) {
  const store = new SpacesStore(prefix);
  const legacyOrganizationId = legacyOrganizationIdForProject(projectId);
  const usesLegacyNamespace =
    !organizationId || organizationId.toLowerCase() === legacyOrganizationId;
  const root = prefix === "CONTENT"
    ? usesLegacyNamespace
      ? `projects/${projectId}/`
      : `organizations/${organizationId}/projects/${projectId}/`
    : "";
  const base = `${root}verification/${randomUUID()}`;
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
    console.log(
      `${prefix}: private JSON round trip and listing/pagination passed.`,
    );
  } finally {
    for (const key of await store.list(`${base}/`)) await store.remove(key);
  }
}
