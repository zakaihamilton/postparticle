import "server-only";
import { z } from "zod";
import legacyProjects from "../../projects.json";
import { identifier, organizationIdentifier } from "./config";
import type { ProjectRecord } from "./projects";

const legacyProjectSchema = z.object({
  id: identifier,
  name: z.string().min(1),
  description: z.string(),
  production: z.boolean().default(true),
  legacyOrganizationId: organizationIdentifier,
});

const legacyProjectListSchema = z.array(legacyProjectSchema);

export function legacyProjectsByOrganization() {
  const projects = legacyProjectListSchema.parse(legacyProjects);
  const grouped = new Map<string, ProjectRecord[]>();

  for (const project of projects) {
    const organizationId = project.legacyOrganizationId.toLowerCase();
    const group = grouped.get(organizationId) ?? [];
    group.push({
      ...project,
      legacyOrganizationId: organizationId,
      archived: false,
      deleting: false,
    });
    grouped.set(organizationId, group);
  }

  return grouped;
}
