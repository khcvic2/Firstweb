// ===========================================
// 1단계: "카카오 로그인" 버튼을 누르면 실행
// 사용자를 카카오 로그인 화면으로 보냅니다.
// 주소: /auth/kakao/login
// ===========================================
import crypto from 'node:crypto';
import { STATE_COOKIE, makeCookie, getRedirectUri, redirect } from '../lib/session.mjs';

export default async (req) => {
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  if (!restApiKey) {
    return new Response('KAKAO_REST_API_KEY 환경 변수가 설정되지 않았습니다.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // state: 이 로그인 요청이 우리 사이트에서 시작됐는지 확인하는 일회용 번호 (해킹 방지)
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: restApiKey,
    redirect_uri: getRedirectUri(req),
    state,
  });

  return redirect(`https://kauth.kakao.com/oauth/authorize?${params}`, [
    makeCookie(req, STATE_COOKIE, state, 10 * 60), // 10분 동안만 유효
  ]);
};

export const config = { path: '/auth/kakao/login' };
