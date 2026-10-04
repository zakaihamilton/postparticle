import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  hashPassword,
  getUser,
  login,
  logout,
  requireActor,
  saveUser,
  verifyPassword,
} from "@/lib/auth";
import { HttpError, identifier, localDriver } from "@/lib/config";
import { errorResponse, json, readJson, sameOrigin } from "@/lib/http";
export const runtime = "nodejs";
const attempts = new Map<string, { count: number; until: number }>();
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
      for (const [key, value] of attempts)
        if (value.until < now) attempts.delete(key);
      const record = attempts.get(ip) ?? { count: 0, until: now + 60_000 };
      record.count++;
      attempts.set(ip, record);
      if (record.count > 10)
        throw new HttpError(
          429,
          "Too many login attempts. Try again in a minute.",
        );
      const data = z
        .object({ username: identifier, password: z.string().min(1).max(256) })
        .parse(await readJson(request));
      await login(data.username, data.password);
      return json({ ok: true });
    }
    if (action === "logout") {
      await logout();
      return json({ ok: true });
    }
    if (action === "password") {
      const actor = await requireActor();
      const data = z
        .object({
          currentPassword: z.string().max(256),
          password: z.string().min(12).max(256),
        })
        .parse(await readJson(request));
      const user = await getUser(actor.username);
      if (
        !user ||
        !(await verifyPassword(data.currentPassword, user.passwordHash))
      )
        throw new HttpError(400, "Current password is incorrect");
      await saveUser(actor.username, {
        ...user,
        passwordHash: await hashPassword(data.password),
        sessionVersion: randomUUID(),
      });
      await logout();
      return json({ ok: true });
    }
    throw new HttpError(404, "Action not found");
  } catch (error) {
    return errorResponse(error);
  }
}
