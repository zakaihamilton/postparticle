import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import LoginForm from "@/components/login-form";
export const metadata: Metadata = { title: "Log in" };
export default async function LoginPage() {
  if (await currentActor()) redirect("/projects");
  return <LoginForm />;
}
