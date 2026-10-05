import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createInitialPlatformAdmin } from "@/lib/initial-admin";
import { HttpError } from "@/lib/config";
import { errorResponse, json, readJson, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

function hasValidBootstrapToken(request: Request) {
  const expected = process.env.INITIAL_ADMIN_BOOTSTRAP_TOKEN;
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected) || !match) return false;

  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(match[1], "hex"),
  );
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!hasValidBootstrapToken(request)) throw new HttpError(404, "Not found");

    const data = z
      .object({
        username: z.string(),
        password: z.string().min(12).max(256),
      })
      .strict()
      .parse(await readJson(request));
    const username = await createInitialPlatformAdmin(
      data.username,
      data.password,
    );
    return json({ ok: true, username }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
