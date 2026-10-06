import "server-only";
import { randomUUID } from "node:crypto";
import {
  getUser,
  hashPassword,
  listUsers,
  saveUser,
} from "./auth";
import { HttpError } from "./config";
import { append, events } from "./events";
import { controlStore } from "./storage";
import { usernameSchema } from "./username";

export async function createInitialPlatformAdmin(
  rawUsername: string,
  password: string,
) {
  const username = usernameSchema.parse(rawUsername);
  const store = controlStore();
  if (password.length < 12 || password.length > 256)
    throw new HttpError(400, "Use a password between 12 and 256 characters");

  if (
    (await listUsers(store)).some((user) => user.platformAdmin) ||
    (await getUser(username, store))
  )
    throw new HttpError(
      409,
      "Bootstrap is only available before the first platform administrator exists",
    );

  await saveUser(
    "bootstrap",
    {
      username,
      passwordHash: await hashPassword(password),
      platformAdmin: true,
      disabled: false,
      sessionVersion: randomUUID(),
    },
    store,
  );
  await append(store, "bootstrap/platform-admins", "bootstrap", "claim", {
    username,
  });

  const initialAdmin = (await events<{ username: string }>(
    store,
    "bootstrap/platform-admins",
  )).find((event) => event.action === "claim")?.data.username;
  if (initialAdmin !== username)
    throw new HttpError(409, "Another account completed initial setup first");

  return username;
}
