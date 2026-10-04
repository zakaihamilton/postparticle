import { usernameSchema } from "@/lib/username";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword, getUser, listUsers, saveUser } from "@/lib/auth";
import { HttpError } from "@/lib/config";
import { json, readJson } from "@/lib/http";
import { manageHandler, managePlatformAdmin } from "@/lib/manage-api";

export const GET = manageHandler(async (request: Request) => {
  await managePlatformAdmin(request);
  return json(
    (await listUsers()).map(({ username, platformAdmin, disabled }) => ({
      username,
      platformAdmin,
      disabled,
    })),
  );
});

export const POST = manageHandler(async (request: Request) => {
  const actor = await managePlatformAdmin(request);
  const data = z
    .object({
      username: usernameSchema,
      password: z.string().min(12).max(256),
    })
    .parse(await readJson(request));
  if (await getUser(data.username))
    throw new HttpError(409, "Account already exists");
  await saveUser(actor.username, {
    username: data.username,
    passwordHash: await hashPassword(data.password),
    platformAdmin: false,
    disabled: false,
    sessionVersion: randomUUID(),
  });
  return json({ ok: true }, 201);
});
