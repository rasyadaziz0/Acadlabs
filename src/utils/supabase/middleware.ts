import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        request.cookies.set(name, value)
                    );
                    response = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // This will refresh session if expired - required for Server Components
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Protected Routes Logic
    // Protect /dashboard and /chat
    if (request.nextUrl.pathname.startsWith("/dashboard") && !user) {
        return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    if (request.nextUrl.pathname.startsWith("/chat") && !user) {
        return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    // Auth Page Logic
    // If user is signed in and tries to access /auth/*, redirect to dashboard
    if (request.nextUrl.pathname.startsWith("/auth/") && user) {
        // Allow logout logic to pass usually, but simple check:
        // If treating all /auth as public, redirect away.
        // Exception: /auth/callback usually needed.
        if (!request.nextUrl.pathname.includes("/callback")) {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
    }

    return response;
}
