// ===========================================
// 1단계: "카카오 로그인" 버튼을 누르면 실행
// 사용자를 카카오 로그인 화면으로 보냅니다.
// 주소: /auth/kakao/login
// ===========================================
import crypto from 'node:crypto';
import {
  STATE_COOKIE, NEXT_COOKIE, safeNextPath, makeCookie, getRedirectUri, redirect,
  getEnv, findMissingEnv, findPlaceholderEnv, configErrorRedirect,
} from '../lib/session.mjs';

export default async (req) => {
  // 필수 변수가 없거나, 선택 변수(Client Secret)에 임시 글자가 남아 있으면 로그인을 시작하지 않음
  const problems = [...new Set([...findMissingEnv(), ...findPlaceholderEnv()])];
  if (problems.length) return configErrorRedirect(problems, 'kakao-login');

  const restApiKey = getEnv('KAKAO_REST_API_KEY');

  // state: 이 로그인 요청이 우리 사이트에서 시작됐는지 확인하는 일회용 번호 (해킹 방지)
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: restApiKey,
    redirect_uri: getRedirectUri(req),
    state,
  });

  // 로그인 후 돌아갈 페이지 (예: /auth/kakao/login?next=/chat.html)
  const next = safeNextPath(new URL(req.url).searchParams.get('next'));

  return redirect(`https://kauth.kakao.com/oauth/authorize?${params}`, [
    makeCookie(req, STATE_COOKIE, state, 10 * 60), // 10분 동안만 유효
    makeCookie(req, NEXT_COOKIE, next, 10 * 60),
  ]);
};

export const config = { path: '/auth/kakao/login' };
