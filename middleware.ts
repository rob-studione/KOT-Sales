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
    pathname.startsWith("/analitika") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/invoices") ||
    pathname.startsWith("/projektai") ||
    pathname.startsWith("/nustatymai")
  );
}

export async function middleware(request: NextRequest) {
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

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

