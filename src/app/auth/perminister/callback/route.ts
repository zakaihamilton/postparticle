import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loginWithPerministerAuthorizationCode } from "@/lib/auth";
import { perministerClientSecretForSso } from "@/lib/perminister-integration";
import {
  matchesPerministerSsoState,
  perministerSsoCookieName,
  readPerministerSsoTransaction,
  safePostParticleReturnTo,
} from "@/lib/perminister-sso";

export const runtime = "nodejs";

function responseToLogin(
  request: Request,
  state: string,
  error = "sso",
  returnTo: string | null = null,
) {
  const query = new URLSearchParams({ error });
  const safeReturn = safePostParticleReturnTo(returnTo);
  if (safeReturn) query.set("next", safeReturn);
  const response = NextResponse.redirect(new URL(`/login?${query}`, request.url), 303);
  const cookieName = perministerSsoCookieName(state);
  if (cookieName) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.getAll("state").length !== 1) {
    return responseToLogin(request, state);
  }
  const cookieName = perministerSsoCookieName(state);
  if (!cookieName) return responseToLogin(request, state);

  let returnTo: string | null = null;
  try {
    const secret = perministerClientSecretForSso();
    const cookieValue = (await cookies()).get(cookieName)?.value;
    const transaction = readPerministerSsoTransaction(cookieValue, secret);
    if (!transaction || !matchesPerministerSsoState(transaction.state, state)) {
      return responseToLogin(request, state);
    }
    returnTo = transaction.returnTo;
    const codes = url.searchParams.getAll("code");
    if (
      url.searchParams.has("error") ||
      url.searchParams.getAll("error").length > 1 ||
      codes.length !== 1 ||
      !codes[0] ||
      codes[0].length > 2048
    ) {
      return responseToLogin(request, state, "sso", returnTo);
    }

    await loginWithPerministerAuthorizationCode(
      codes[0],
      transaction.verifier,
      transaction.nonce,
      transaction.redirectUri,
    );
    const response = NextResponse.redirect(
      new URL(returnTo ?? "/projects", request.url),
      303,
    );
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return responseToLogin(request, state, "sso", returnTo);
  }
}
