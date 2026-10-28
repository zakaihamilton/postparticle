import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import LoginForm from "@/components/login-form";
import { perministerRecoveryUrl } from "@/lib/perminister-integration";
export const metadata: Metadata = { title: "Log in" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentActor()) redirect("/projects");
  const { error } = await searchParams;
  return (
    <LoginForm
      recoveryUrl={perministerRecoveryUrl()}
      initialError={
        error === "sso"
          ? "Perminister sign-in could not be completed. Please try again."
          : ""
      }
    />
  );
}
