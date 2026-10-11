import { readFile } from "node:fs/promises";
import { z } from "zod";
import { identifier, organizationIdentifier } from "../src/lib/config";
import { contentStore } from "../src/lib/storage";
import { writeProjectRegistry } from "../src/lib/projects";

if (process.env.STORAGE_DRIVER !== "spaces")
  throw new Error("Project migration requires STORAGE_DRIVER=spaces.");

const legacyProjectSchema = z.object({
  id: identifier,
  name: z.string().min(1),
  description: z.string(),
  production: z.boolean().optional(),
  legacyOrganizationId: organizationIdentifier,
});
const legacyProjects = z
  .array(legacyProjectSchema)
  .parse(
    JSON.parse(
      await readFile(new URL("../projects.json", import.meta.url), "utf8"),
    ),
  );
const grouped = new Map<string, z.infer<typeof legacyProjectSchema>[]>();
for (const project of legacyProjects) {
  const organizationId = project.legacyOrganizationId.toLowerCase();
  grouped.set(organizationId, [
    ...(grouped.get(organizationId) ?? []),
    project,
  ]);
}
if (!grouped.size)
  throw new Error("projects.json does not contain any projects.");

const store = contentStore();
for (const organizationId of grouped.keys()) {
  const key = `organizations/${organizationId}/projects.json`;
  if ((await store.get<unknown>(key)) !== null)
    throw new Error(`Refusing to overwrite existing registry: ${key}`);
}

for (const [organizationId, projects] of grouped) {
  await writeProjectRegistry(
    organizationId,
    projects.map((project) => ({
      ...project,
      legacyOrganizationId: organizationId,
      archived: false,
      deleting: false,
    })),
    { onlyIfMissing: true },
  );
  console.log(
    `Migrated ${projects.length} projects to organizations/${organizationId}/projects.json.`,
  );
}
