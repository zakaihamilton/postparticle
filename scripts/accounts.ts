import { getUser, listUsers, resetUserPassword } from "../src/lib/auth";
import { usernameSchema } from "../src/lib/username";
import { passwordInput } from "./password-input";

try {
  const [action, rawUsername] = process.argv.slice(2);
  if (action === "list") {
    const users = await listUsers();
    for (const user of users)
      console.log(
        `${user.username}\t${user.platformAdmin ? "Administrator" : "Account"}\t${user.disabled ? "Disabled" : "Active"}`,
      );
    if (!users.length)
      console.log("No accounts found in the configured storage.");
  } else if (action === "reset" && rawUsername) {
    const username = usernameSchema.parse(rawUsername);
    const user = await getUser(username);
    if (!user) throw new Error("Account not found");
    const password = await passwordInput("New password (12–256 characters): ");
    if (process.stdin.isTTY) {
      const confirmation = await passwordInput("Confirm new password: ");
      if (password !== confirmation) throw new Error("Passwords do not match");
    }
    await resetUserPassword("operator-recovery", username, password);
    console.log(
      `Password reset for ${username}. Previous sessions were revoked.`,
    );
    if (user.disabled)
      console.log(
        "This account is disabled. An administrator must enable it before sign-in.",
      );
  } else {
    throw new Error(
      "Usage: npm run accounts -- list | reset <username-or-email>",
    );
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Account recovery failed",
  );
  process.exitCode = 1;
}
