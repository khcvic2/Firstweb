// ===========================================
// 지금 로그인한 사용자 정보를 알려줌
// 웹페이지가 이 주소를 불러서 "로그인 버튼"과 "닉네임" 중 무엇을 보여줄지 정합니다.
// 주소: /api/me
// ===========================================
import { SESSION_COOKIE, getCookie, verifySession } from '../lib/session.mjs';

export default async (req) => {
  const session = verifySession(getCookie(req, SESSION_COOKIE));
  const result = session
    ? { loggedIn: true, user: { id: session.id, nickname: session.nickname, image: session.image } }
    : { loggedIn: false };

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};

export const config = { path: '/api/me' };
