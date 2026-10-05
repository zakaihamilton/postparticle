import { usernameSchema } from "../src/lib/username";
import { passwordInput } from "./password-input";
import { createInitialPlatformAdmin } from "../src/lib/initial-admin";

try {
  const username = usernameSchema.parse(process.argv[2] || "admin");
  const password = await passwordInput(
    "Initial password (minimum 12 characters): ",
  );
  await createInitialPlatformAdmin(username, password);
  console.log(
    `Created platform administrator ${username}. Sign in through /login.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Bootstrap failed");
  process.exitCode = 1;
}
