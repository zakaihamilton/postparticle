import { z } from "zod";
import { getUser, membership, setMembership } from "@/lib/auth";
import { HttpError, projects, projectById } from "@/lib/config";
import { json, readJson } from "@/lib/http";
import { manageHandler, managePlatformAdmin } from "@/lib/manage-api";
import { usernameSchema } from "@/lib/username";

type Context = { params: Promise<{ username: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const actor = await managePlatformAdmin(request);
  const username = usernameSchema.parse((await context.params).username);
  const user = await getUser(username);
  if (!user) throw new HttpError(404, "Account not found");

  return json({
    projects: await Promise.all(
      projects.map(async (project) => ({
        ...project,
        role: user.platformAdmin
          ? ("admin" as const)
          : await membership(username, actor.organizationId, project.id),
      })),
    ),
  });
});

export const POST = manageHandler(
  async (request: Request, context: Context) => {
    const actor = await managePlatformAdmin(request);
    const username = usernameSchema.parse((await context.params).username);
    const user = await getUser(username);
    if (!user) throw new HttpError(404, "Account not found");
    if (user.platformAdmin)
      throw new HttpError(
        400,
        "Platform administrators have access to every project",
      );

    const data = z
      .object({
        projectId: z.string(),
        role: z.enum(["admin", "editor", "viewer"]).nullable(),
      })
      .parse(await readJson(request));
    projectById(data.projectId);
    await setMembership(username, actor.organizationId, data.projectId, data.role);
    return json({ ok: true });
  },
);
