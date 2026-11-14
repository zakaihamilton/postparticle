import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, AuthShell } from "panel-frame-ui";
import { currentActor } from "@/lib/auth";
import { safePostParticleReturnTo } from "@/lib/perminister-sso";
import { BrandContent } from "@/components/ui";

export const metadata: Metadata = { title: "Log in" };

const messages: Record<string, string> = {
  sso: "Perminister sign-in could not be completed. Please try again.",
  invalid: "This account does not have access to PostParticle.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; signedOut?: string }>;
}) {
  const params = await searchParams;
  const next = safePostParticleReturnTo(params.next);
  const error = params.error ? messages[params.error] : undefined;
  const signedOut = params.signedOut === "1";
  const actor = await currentActor();
  if (actor && !signedOut) redirect(next ?? "/projects");
  if (!error && !signedOut) {
    const query = next ? "?next=" + encodeURIComponent(next) : "";
    redirect("/auth/perminister/start" + query);
  }
  const retryHref =
    "/auth/perminister/start" +
    (next ? "?next=" + encodeURIComponent(next) : "") +
    (signedOut || error ? (next ? "&" : "?") + "prompt=login" : "");

  return (
    <AuthShell
      brand={<BrandContent />}
      utility={null}
      aside={
        <>
          <p className="eyebrow">THE EDITORIAL WORKSPACE</p>
          <h1>Make room for your next story.</h1>
          <p>Write, organize, and publish. Everything your team needs, in one place.</p>
        </>
      }
    >
      <AuthCard className="auth-card">
        <h2>{signedOut ? "You’re signed out." : "Sign-in could not be completed."}</h2>
        <p>{error ?? "Your PostParticle session has ended."}</p>
        <Link href={retryHref} className="button button-primary form-submit">
          {signedOut ? "Sign in again" : "Try again with Perminister"}
        </Link>
      </AuthCard>
    </AuthShell>
  );
}
