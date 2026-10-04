import "server-only";
import registry from "../../projects.json";
import { z } from "zod";
import type { Project } from "./types";
export const identifier = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
const projectSchema = z.object({
  id: identifier,
  name: z.string().min(1),
  description: z.string(),
  envPrefix: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
});
export const projects: Project[] = z.array(projectSchema).parse(registry);
if (new Set(projects.map((p) => p.id)).size !== projects.length)
  throw new Error("Duplicate project IDs");
export function projectById(id: string): Project {
  const project = projects.find((p) => p.id === id);
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}
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
