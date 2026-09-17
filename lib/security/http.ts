import { NextResponse } from "next/server";
import { keyedHash } from "./crypto";

export const privateHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
  Expires: "0",
};

export function jsonResponse(
  body: unknown,
  init: ResponseInit & { headers?: HeadersInit } = {},
) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...privateHeaders, ...(init.headers ?? {}) },
  });
}

export function clientFingerprint(request: Request) {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip =
    forwarded ??
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    "local";
  const userAgent = headers.get("user-agent") ?? "unknown";
  return {
    ipHash: keyedHash(ip),
    userAgentHash: keyedHash(userAgent),
    rateKey: keyedHash(`${ip}:${userAgent}`),
  };
}

export function authError(message = "Authentication required.") {
  return jsonResponse({ error: { code: "AUTH_REQUIRED", message } }, { status: 401 });
}

export function forbidden(message = "You do not have access to this resource.") {
  return jsonResponse({ error: { code: "FORBIDDEN", message } }, { status: 403 });
}
