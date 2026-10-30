import { NextResponse, type NextRequest } from "next/server";

// Быстрая проверка «есть ли cookie сессии». Это только удобство:
// настоящая проверка прав выполняется на сервере в requireRole().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("nc_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/me/:path*", "/company/:path*", "/admin/:path*"],
};
