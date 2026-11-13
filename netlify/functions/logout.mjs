// ===========================================
// 로그아웃: 로그인 쿠키를 지우고 첫 화면으로 이동
// 주소: /auth/logout
// ===========================================
import { SESSION_COOKIE, makeCookie, redirect } from '../lib/session.mjs';

export default async (req) => redirect('/?login=logout', [makeCookie(req, SESSION_COOKIE, '', 0)]);

export const config = { path: '/auth/logout' };
