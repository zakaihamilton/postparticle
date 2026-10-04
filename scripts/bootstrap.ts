import { usernameSchema } from "../src/lib/username";
import { randomUUID } from "node:crypto";
import { passwordInput } from "./password-input";
import {
  getUser,
  hashPassword,
  listUsers,
  saveUser,
  setMembership,
} from "../src/lib/auth";
import { projects } from "../src/lib/config";

try {
  const username = usernameSchema.parse(process.argv[2] || "admin");
  if (
    (await listUsers()).some((u) => u.platformAdmin) ||
    (await getUser(username))
  )
    throw new Error(
      "Bootstrap is only available before the first platform administrator exists",
    );
  const password = await passwordInput(
    "Initial password (minimum 12 characters): ",
  );
  if (password.length < 12 || password.length > 256)
    throw new Error("Use a password between 12 and 256 characters");
  await saveUser("bootstrap", {
    username,
    passwordHash: await hashPassword(password),
    platformAdmin: true,
    disabled: false,
    sessionVersion: randomUUID(),
  });
  for (const project of projects)
    await setMembership("bootstrap", username, project.id, "admin");
  console.log(
    `Created platform administrator ${username}. Sign in through /login.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Bootstrap failed");
  process.exitCode = 1;
}
