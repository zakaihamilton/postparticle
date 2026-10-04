import { allowedProjects } from "@/lib/auth";
import { json } from "@/lib/http";
import { manageActor, manageHandler } from "@/lib/manage-api";

export const GET = manageHandler(async (request: Request) => {
  const actor = await manageActor(request);
  return json({ actor, projects: await allowedProjects(actor) });
});
