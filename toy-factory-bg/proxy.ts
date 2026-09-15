import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";

/**
 * Defence in depth for the admin area. Every page and API route under /admin
 * still checks the session itself; this middleware makes a forgotten check
 * non-exploitable by rejecting unauthenticated requests before they reach the
 * handler.
 *
 * Next.js Proxy runs in Node. Only verifies the signed cookie here;
 * per-handler authorization remains mandatory.
 */

const COOKIE_NAME = "toy_admin_session";

// Reachable without a session: the login page and the login/logout endpoints.
const PUBLIC_ADMIN_PATHS = new Set(["/admin", "/api/admin/login", "/api/admin/logout"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return NextResponse.next();

  const session = request.cookies.get(COOKIE_NAME)?.value;
  if (await verifyAdminSession(session)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const loginUrl = new URL("/admin", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
