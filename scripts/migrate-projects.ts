import { contentStore } from "../src/lib/storage";
import { writeProjectRegistry } from "../src/lib/projects";
import { legacyProjectsByOrganization } from "../src/lib/legacy-projects";

if (process.env.STORAGE_DRIVER !== "spaces")
  throw new Error("Project migration requires STORAGE_DRIVER=spaces.");

const grouped = legacyProjectsByOrganization();
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
    })),
    { onlyIfMissing: true },
  );
  console.log(
    `Migrated ${projects.length} projects to organizations/${organizationId}/projects.json.`,
  );
}
