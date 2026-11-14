import { NextResponse } from "next/server";
import {
  perministerAuthorizationUrl,
  perministerClientSecretForSso,
} from "@/lib/perminister-integration";
import {
  createPerministerSsoTransaction,
  perministerSsoCookieName,
  safePostParticleReturnTo,
  sealPerministerSsoTransaction,
} from "@/lib/perminister-sso";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const generated = createPerministerSsoTransaction();
    const prompt = url.searchParams.get("prompt") === "login" ? "login" : undefined;
    const destination = perministerAuthorizationUrl(
      generated.state,
      generated.challenge,
      generated.nonce,
      url.origin,
      prompt,
    );
    const redirectUri = new URL(destination).searchParams.get("redirect_uri") ?? "";
    if (!redirectUri) throw new Error("Perminister callback is missing.");
    const transaction = {
      state: generated.state,
      verifier: generated.verifier,
      nonce: generated.nonce,
      redirectUri,
      returnTo: safePostParticleReturnTo(url.searchParams.get("next")),
    };
    const secret = perministerClientSecretForSso();
    const cookieName = perministerSsoCookieName(transaction.state);
    if (!cookieName) throw new Error("Invalid SSO transaction state.");
    const response = NextResponse.redirect(destination, 302);
    response.cookies.set(cookieName, sealPerministerSsoTransaction(transaction, secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/login?error=sso", request.url), 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
