import { json } from "@/lib/http";
import { projectHandler } from "@/lib/manage-api";

export const GET = projectHandler(async (_request, { project, role }) =>
  json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
    },
    role,
  }),
);
