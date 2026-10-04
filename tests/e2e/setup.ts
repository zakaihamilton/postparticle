import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
export default async function setup() {
  const root = process.env.LOCAL_STORAGE_PATH!;
  execFileSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/seed-test.ts"],
    { env: { ...process.env, STORAGE_DRIVER: "local" }, stdio: "inherit" },
  );
  // Each run seeds new fixture data; discard cached public responses from prior runs.
  await rm(
    new URL(
      "../../examples/next-blog/.next/cache/fetch-cache",
      import.meta.url,
    ),
    { recursive: true, force: true },
  );
  return async () => {
    await rm(root, { recursive: true, force: true });
  };
}
