import { usernameSchema } from "@/lib/username";
import { z } from "zod";
import { projectMemberAccounts, setMembership } from "@/lib/auth";
import { HttpError } from "@/lib/config";
import { json, readJson } from "@/lib/http";
import { manageHandler, manageProject } from "@/lib/manage-api";

type Context = { params: Promise<{ projectId: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { actor, projectId } = await manageProject(
    request,
    (await context.params).projectId,
    true,
  );
  return json(await projectMemberAccounts(actor.organizationId, projectId));
});

export const POST = manageHandler(
  async (request: Request, context: Context) => {
    const { actor, projectId } = await manageProject(
      request,
      (await context.params).projectId,
      true,
    );
    const data = z
      .object({
        username: usernameSchema,
        role: z.enum(["admin", "editor", "viewer"]).nullable(),
      })
      .parse(await readJson(request));
    if (!actor.platformAdmin && data.username === actor.username)
      throw new HttpError(400, "Ask another administrator to change your role");
    await setMembership(
      data.username,
      actor.organizationId,
      projectId,
      data.role,
    );
    return json({ ok: true });
  },
);
