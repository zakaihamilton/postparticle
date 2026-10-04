import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requiredEnv } from "./config";
export function sameOrigin(request: Request) {
  const expected = new URL(requiredEnv("APP_ORIGIN")).origin;
  if (request.headers.get("origin") !== expected)
    throw new HttpError(403, "Request origin is not allowed");
}
export async function readBytes(
  request: Request,
  limit: number,
): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > limit)
    throw new HttpError(413, "Request is too large");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function readJson(request: Request) {
  const text = new TextDecoder().decode(await readBytes(request, 1_000_000));
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  console.error(
    "Postparticle request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    { error: "Storage is temporarily unavailable. Please retry." },
    503,
  );
}
