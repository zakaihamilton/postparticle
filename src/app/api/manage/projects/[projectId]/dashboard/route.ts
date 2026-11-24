import { json } from "@/lib/http";
import { projectHandler } from "@/lib/manage-api";
import { readWorkspaceDashboard } from "@/lib/workspace-dashboard";

export const GET = projectHandler(async (_request, { store }) =>
  json(await readWorkspaceDashboard(store)),
);
