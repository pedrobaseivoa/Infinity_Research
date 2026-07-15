import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// Single-user, self-hosted mode.
// There is no login screen: whoever can reach this app is the "owner".
// This proxy (Next.js middleware convention) guarantees an authenticated owner
// session on every request, so Row Level Security (scoped to auth.uid()) keeps
// working unchanged.
//
// SECURITY: because there is no login, access control is entirely network-level.
// Only run this behind localhost or a private network you control. Do not expose
// it to the public internet without putting your own auth/proxy in front of it.

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@infinity.local'
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'infinity-self-hosted-owner'

export async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    response = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        // No session yet — sign in as the owner (create it on first run).
        const { error } = await supabase.auth.signInWithPassword({
            email: OWNER_EMAIL,
            password: OWNER_PASSWORD,
        })

        if (error) {
            const admin = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { autoRefreshToken: false, persistSession: false } }
            )
            await admin.auth.admin.createUser({
                email: OWNER_EMAIL,
                password: OWNER_PASSWORD,
                email_confirm: true,
            })
            await supabase.auth.signInWithPassword({
                email: OWNER_EMAIL,
                password: OWNER_PASSWORD,
            })
        }
    }

    return response
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
