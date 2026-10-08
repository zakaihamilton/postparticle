import { usernameSchema } from "@/lib/username";
import { z } from "zod";
import {
  getUser,
  minimumAccountPasswordLength,
  updatePerministerAccount,
} from "@/lib/auth";
import { HttpError } from "@/lib/config";
import { json, readJson } from "@/lib/http";
import { manageHandler, managePlatformAdmin } from "@/lib/manage-api";

type Context = { params: Promise<{ username: string }> };

export const PATCH = manageHandler(
  async (request: Request, context: Context) => {
    const actor = await managePlatformAdmin(request);
    const username = usernameSchema.parse((await context.params).username);
    const user = await getUser(username);
    if (!user) throw new HttpError(404, "Account not found");
    if (user.username === actor.username)
      throw new HttpError(
        400,
        "Use account settings to change your own account",
      );
    const data = z
      .object({
        disabled: z.boolean().optional(),
        password: z
          .string()
          .min(minimumAccountPasswordLength())
          .max(256)
          .optional(),
      })
      .parse(await readJson(request));
    await updatePerministerAccount(username, data);
    return json({ ok: true });
  },
);
