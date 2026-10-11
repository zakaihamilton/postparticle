import "server-only";
import { z } from "zod";
export const identifier = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
export const organizationIdentifier = z.string().uuid();
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value)
    throw new HttpError(
      503,
      "Storage is not configured. Follow the setup guide.",
    );
  return value;
}
export function localDriver() {
  if (process.env.STORAGE_DRIVER !== "local") return false;
  if (
    process.env.VERCEL ||
    (process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_TEST_STORAGE !== "true")
  )
    throw new Error("Local storage is disabled on deployments");
  return true;
}
