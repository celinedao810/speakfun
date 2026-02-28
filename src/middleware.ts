// middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Update request cookies so getUser() sees refreshed tokens
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          )
          // Recreate response with updated request
          res = NextResponse.next({ request: req })
          // Set cookies on response so browser receives them
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = req.nextUrl.pathname

  // Redirect logged-in users away from auth pages
  if (user && (pathname.startsWith('/login') || pathname.startsWith('/signup'))) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    const redirectRes = NextResponse.redirect(url)
    // Carry over any cookie changes (e.g. token refresh) to the redirect response
    res.cookies.getAll().forEach(cookie => {
      redirectRes.cookies.set(cookie.name, cookie.value)
    })
    return redirectRes
  }

  // Protect private routes
  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/signup') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/_next') &&
    pathname !== '/favicon.ico'
  ) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    const redirectRes = NextResponse.redirect(url)
    res.cookies.getAll().forEach(cookie => {
      redirectRes.cookies.set(cookie.name, cookie.value)
    })
    return redirectRes
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|workbox-.*\\.js|icons/.*).*)'],
}
