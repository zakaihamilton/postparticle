import { allowedProjects, requireAuthContext } from "@/lib/auth";
import { json } from "@/lib/http";
import { manageHandler } from "@/lib/manage-api";

export const GET = manageHandler(async () => {
  const context = await requireAuthContext();
  return json({
    actor: context.actor,
    projects: await allowedProjects(context),
  });
});
