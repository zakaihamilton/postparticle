import { usernameSchema } from "@/lib/username";
import { revokeUserSessions } from "@/lib/auth";
import { json } from "@/lib/http";
import { manageHandler, managePlatformAdmin } from "@/lib/manage-api";

type Context = { params: Promise<{ username: string }> };

export const POST = manageHandler(
  async (request: Request, context: Context) => {
    await managePlatformAdmin(request);
    const username = usernameSchema.parse((await context.params).username);
    await revokeUserSessions(username);
    return json({ ok: true });
  },
);
