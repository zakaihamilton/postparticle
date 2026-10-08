import { usernameSchema } from "@/lib/username";
import { z } from "zod";
import {
  changePerministerPassword,
  login,
  minimumAccountPasswordLength,
  logout,
  requireActor,
  selectOrganization,
} from "@/lib/auth";
import { HttpError, localDriver } from "@/lib/config";
import { errorResponse, json, readJson, sameOrigin } from "@/lib/http";
import { loginAttemptAllowed } from "@/lib/login-rate-limit";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    sameOrigin(request);
    const { action } = await context.params;
    if (action === "login") {
      if (
        process.env.NODE_ENV === "production" &&
        !localDriver() &&
        process.env.LOGIN_RATE_LIMIT_CONFIGURED !== "true"
      )
        throw new HttpError(
          503,
          "Configure the deployment login rate limit before signing in.",
        );
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
      const now = Date.now();
      if (!loginAttemptAllowed(ip, now))
        throw new HttpError(
          429,
          "Too many login attempts. Try again in a minute.",
        );
      const data = z
        .object({
          username: usernameSchema,
          password: z.string().min(1).max(256),
        })
        .parse(await readJson(request));
      await login(data.username, data.password);
      return json({ ok: true });
    }
    if (action === "organization") {
      const data = z
        .object({ organizationId: z.string().uuid() })
        .parse(await readJson(request));
      await selectOrganization(data.organizationId);
      return json({ ok: true });
    }
    if (action === "logout") {
      await logout();
      return json({ ok: true });
    }
    if (action === "password") {
      await requireActor();
      const data = z
        .object({
          currentPassword: z.string().max(256),
          password: z.string().min(minimumAccountPasswordLength()).max(256),
        })
        .parse(await readJson(request));
      await changePerministerPassword(data.currentPassword, data.password);
      await logout();
      return json({ ok: true });
    }
    throw new HttpError(404, "Action not found");
  } catch (error) {
    return errorResponse(error);
  }
}
