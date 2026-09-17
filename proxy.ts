import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth/constants";

/** Pages that need a signed-in session; everything else is reachable signed out. */
const privatePaths = new Set(["/", "/career-os", "/cv", "/account"]);

function addPrivateHeaders(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

/**
 * Builds the Content Security Policy for this request.
 *
 * Next.js boots React from an inline script, so a bare `script-src 'self'`
 * blocks hydration and leaves every page rendered but dead. A per-request nonce
 * keeps the policy strict — no `unsafe-inline` for scripts — while letting the
 * framework's own bootstrap run: Next reads this header during rendering and
 * stamps the nonce onto the scripts it emits. Inline *style attributes* stay
 * allowed because the UI sets widths on progress meters from React state.
 */
function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://api.groq.com https://serpapi.com",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const policy = contentSecurityPolicy(nonce);

  if (privatePaths.has(pathname)) {
    const hasSession = Boolean(request.cookies.get(sessionCookieName)?.value);
    if (!hasSession) {
      const redirect = NextResponse.redirect(new URL("/login", request.url));
      redirect.headers.set("Content-Security-Policy", policy);
      return redirect;
    }
  }

  // Next.js picks the nonce up from the *request* header while it renders.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return privatePaths.has(pathname) ? addPrivateHeaders(response) : response;
}

export const config = {
  // Everything a browser executes scripts from needs the nonce; build assets and
  // the optimizer's own output do not.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
