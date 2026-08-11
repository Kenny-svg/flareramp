import { NextRequest, NextResponse } from "next/server";

const windows = new Map<string, { count: number; resetAt: number }>();

function budget(pathname: string, method: string): number {
  if (pathname === "/api/mint/sign" && method === "POST") return 10;
  if (pathname === "/api/mint/review" && method === "POST") return 30;
  return 120;
}

export function middleware(request: NextRequest) {
  const now = Date.now();
  const client =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.ip ??
    "unknown";
  const routeKey = `${client}:${request.method}:${request.nextUrl.pathname}`;
  const current = windows.get(routeKey);
  const windowState =
    !current || current.resetAt <= now
      ? { count: 1, resetAt: now + 60_000 }
      : { count: current.count + 1, resetAt: current.resetAt };
  windows.set(routeKey, windowState);
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (windowState.count > budget(request.nextUrl.pathname, request.method)) {
    return NextResponse.json(
      { error: "Rate limit exceeded", requestId },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((windowState.resetAt - now) / 1_000)),
          ),
          "X-Request-Id": requestId,
        },
      },
    );
  }
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: "/api/mint/:path*",
};
