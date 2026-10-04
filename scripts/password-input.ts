import { createInterface } from "node:readline/promises";

export async function passwordInput(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const readline = createInterface({ input: process.stdin });
    for await (const line of readline) {
      readline.close();
      return line;
    }
    throw new Error("Provide a password on stdin");
  }
  process.stdout.write(prompt);
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
