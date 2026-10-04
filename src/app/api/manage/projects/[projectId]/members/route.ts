import { usernameSchema } from "@/lib/username";
import { z } from "zod";
import { getUser, listUsers, membership, setMembership } from "@/lib/auth";
import { HttpError } from "@/lib/config";
import { json, readJson } from "@/lib/http";
import { manageHandler, manageProject } from "@/lib/manage-api";

type Context = { params: Promise<{ projectId: string }> };

export const GET = manageHandler(async (request: Request, context: Context) => {
  const { projectId } = await manageProject(
    request,
    (await context.params).projectId,
    true,
  );
  return json(
    await Promise.all(
      (await listUsers()).map(async ({ username, disabled }) => ({
        username,
        disabled,
        role: await membership(username, projectId),
      })),
    ),
  );
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
    if (!(await getUser(data.username)))
      throw new HttpError(
        404,
        "Create this account as a platform administrator first",
      );
    if (!actor.platformAdmin && data.username === actor.username)
      throw new HttpError(400, "Ask another administrator to change your role");
    await setMembership(actor.username, data.username, projectId, data.role);
    return json({ ok: true });
  },
);
