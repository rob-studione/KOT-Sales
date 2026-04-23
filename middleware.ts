import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/login") return false;
  if (pathname.startsWith("/auth/")) return false;
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/favicon")) return false;
  return (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/apzvalga") ||
    pathname.startsWith("/analitika") ||
    pathname.startsWith("/klientai") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/invoices") ||
    pathname.startsWith("/projektai") ||
    pathname.startsWith("/nustatymai")
  );
}

export async function middleware(request: NextRequest) {
  const t0 = Date.now();
  const { pathname } = request.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  let response = NextResponse.next();

  const supabase = createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const authT0 = Date.now();
  const { data } = await supabase.auth.getUser();
  const authMs = Date.now() - authT0;
  const user = data.user;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const totalMs = Date.now() - t0;
  // Expose middleware timings for DevTools Network inspection.
  response.headers.set(
    "server-timing",
    `mw;dur=${totalMs}, mw_auth;dur=${authMs}`
  );
  response.headers.set("x-crm-mw-ms", String(totalMs));
  response.headers.set("x-crm-mw-auth-ms", String(authMs));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

