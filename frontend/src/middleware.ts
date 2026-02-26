/**
 * @project AncestorTree
 * @file src/proxy.ts  <-- Lưu ý đổi tên file từ middleware.ts thành proxy.ts theo chuẩn Next 16 nhé
 * @description Auth middleware for protected routes
 * @version 1.2.1
 * @updated 2026-02-26
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];

const authRequiredPaths = [
  '/', // Trang chủ
  '/people', '/tree', '/directory', '/events',
  '/achievements', '/charter', '/cau-duong', '/contributions',
  '/documents', '/fund', '/admin',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({
    request: { headers: request.headers },
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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user: { id: string } | null = null;
  try {
    const result = await Promise.race([
      supabase.auth.getUser().then(r => r.data.user),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
    ]);
    user = result;
  } catch {
    user = null;
  }

  // 1. Phân loại chính xác đường dẫn hiện tại
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  const isAuthRequired = authRequiredPaths.some(path => 
    path === '/' ? pathname === '/' : pathname.startsWith(path) // Sửa lỗi nhận diện nhầm '/'
  );

  // 2. Xử lý User CHƯA đăng nhập
  if (!user) {
    // Nếu vào trang cần bảo vệ (và không phải public path), đẩy về login
    if (isAuthRequired && !isPublicPath) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  } 
  
  // 3. Xử lý User ĐÃ đăng nhập
  if (user) {
    // Không cho vào lại các trang public (login/register), đẩy về trang chủ
    if (isPublicPath) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Kiểm tra quyền Admin
    if (pathname.startsWith('/admin')) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (profile?.role !== 'admin' && profile?.role !== 'editor') {
          return NextResponse.redirect(new URL('/', request.url));
        }
      } catch {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};