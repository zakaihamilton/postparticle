import { z } from "zod";
import {
  changePerministerPassword,
  minimumAccountPasswordLength,
  logout,
  requireActor,
  selectOrganization,
} from "@/lib/auth";
import { HttpError } from "@/lib/config";
import { errorResponse, json, readJson, sameOrigin } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    sameOrigin(request);
    const { action } = await context.params;
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
