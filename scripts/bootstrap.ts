import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import {
  getUser,
  hashPassword,
  listUsers,
  saveUser,
  setMembership,
} from "../src/lib/auth";
import { identifier, projects } from "../src/lib/config";
async function passwordInput(): Promise<string> {
  if (!process.stdin.isTTY) {
    const readline = createInterface({ input: process.stdin });
    for await (const line of readline) {
      readline.close();
      return line;
    }
    throw new Error("Provide a password on stdin");
  }
  process.stdout.write("Initial password (minimum 12 characters): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let password = "";
    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write("\n");
    }
    function onData(chunk: Buffer) {
      for (const char of chunk.toString()) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(password);
          return;
        }
        if (char === "\u007f") password = password.slice(0, -1);
        else password += char;
      }
    }
    process.stdin.on("data", onData);
  });
}
try {
  const username = identifier.parse(process.argv[2] || "admin");
  if (
    (await listUsers()).some((u) => u.platformAdmin) ||
    (await getUser(username))
  )
    throw new Error(
      "Bootstrap is only available before the first platform administrator exists",
    );
  const password = await passwordInput();
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
