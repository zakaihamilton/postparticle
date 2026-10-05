import "server-only";
import { randomUUID } from "node:crypto";
import {
  getUser,
  hashPassword,
  listUsers,
  saveUser,
  setMembership,
} from "./auth";
import { HttpError, projects } from "./config";
import { usernameSchema } from "./username";

export async function createInitialPlatformAdmin(
  rawUsername: string,
  password: string,
) {
  const username = usernameSchema.parse(rawUsername);
  if (password.length < 12 || password.length > 256)
    throw new HttpError(400, "Use a password between 12 and 256 characters");

  if (
    (await listUsers()).some((user) => user.platformAdmin) ||
    (await getUser(username))
  )
    throw new HttpError(
      409,
      "Bootstrap is only available before the first platform administrator exists",
    );

  await saveUser("bootstrap", {
    username,
    passwordHash: await hashPassword(password),
    platformAdmin: true,
    disabled: false,
    sessionVersion: randomUUID(),
  });
  for (const project of projects)
    await setMembership("bootstrap", username, project.id, "admin");

  return username;
}
