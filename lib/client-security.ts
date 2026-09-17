"use client";

let csrfToken: string | null = null;

function authRequiredResponse() {
  return Response.json(
    {
      error: {
        code: "AUTH_REQUIRED",
        message: "Please sign in again.",
      },
    },
    { status: 401 },
  );
}

export async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Please sign in again.");
  const body = await response.json();
  csrfToken = body.csrfToken;
  if (!csrfToken) throw new Error("Please sign in again.");
  return csrfToken;
}

export async function secureFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    try {
      headers.set("x-csrf-token", await getCsrfToken());
    } catch {
      await clearSensitiveClientState();
      return authRequiredResponse();
    }
  }
  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401) csrfToken = null;
  return response;
}

export async function clearSensitiveClientState() {
  csrfToken = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("lazyhire:session-cleared"));
    window.dispatchEvent(new Event("orvio:session-cleared"));
  }
  try {
    sessionStorage.removeItem("lazyhire:career-assistant");
    sessionStorage.removeItem("lazyhire:selected-job");
    sessionStorage.removeItem("lazyhire:resume-profile");
    sessionStorage.removeItem("orvio:career-tutor");
    sessionStorage.removeItem("orvio:selected-job");
    sessionStorage.removeItem("orvio:resume-profile");
    sessionStorage.removeItem("job-hunter:selected-job");
    sessionStorage.removeItem("job-hunter:resume-profile");
    localStorage.removeItem("lazyhire:selected-job");
    localStorage.removeItem("lazyhire:resume-profile");
    localStorage.removeItem("orvio:selected-job");
    localStorage.removeItem("orvio:resume-profile");
    localStorage.removeItem("job-hunter:selected-job");
    localStorage.removeItem("job-hunter:resume-profile");
  } catch {
    /* Storage may be unavailable in hardened browser modes. */
  }
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    /* Cache API cleanup is best-effort. */
  }
}
