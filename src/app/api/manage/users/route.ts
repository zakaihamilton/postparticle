import { usernameSchema } from "@/lib/username";
import { z } from "zod";
import {
  createPerministerAccount,
  listUsers,
  minimumAccountPasswordLength,
} from "@/lib/auth";
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
  await managePlatformAdmin(request);
  const data = z
    .object({
      username: usernameSchema,
      password: z.string().min(minimumAccountPasswordLength()).max(256),
    })
    .parse(await readJson(request));
  const result = await createPerministerAccount(data.username, data.password);
  return json(
    { ok: true, created: result.created === true },
    result.created === true ? 201 : 200,
  );
});
