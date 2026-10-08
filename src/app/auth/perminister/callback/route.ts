import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loginWithPerministerAuthorizationCode } from "@/lib/auth";
import { perministerClientSecretForSso } from "@/lib/perminister-integration";
import {
  matchesPerministerSsoState,
  perministerSsoCookieName,
  readPerministerSsoTransaction,
} from "@/lib/perminister-sso";

export const runtime = "nodejs";

function responseToLogin(request: Request, state: string, error = "sso") {
  const response = NextResponse.redirect(
    new URL(`/login?error=${error}`, request.url),
    303,
  );
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
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.has("error") || !code || !state)
    return responseToLogin(request, state);

  const cookieName = perministerSsoCookieName(state);
  if (!cookieName) return responseToLogin(request, state);

  try {
    const secret = perministerClientSecretForSso();
    const cookieValue = (await cookies()).get(cookieName)?.value;
    const transaction = readPerministerSsoTransaction(cookieValue, secret);
    if (!transaction || !matchesPerministerSsoState(transaction.state, state)) {
      return responseToLogin(request, state);
    }
    await loginWithPerministerAuthorizationCode(code, transaction.verifier);
    const response = NextResponse.redirect(
      new URL("/projects", request.url),
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
    return responseToLogin(request, state);
  }
}
