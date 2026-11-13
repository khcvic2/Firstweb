// ===========================================
// 2단계: 카카오 로그인을 마치면 카카오가 이 주소로 돌려보냄
// 받은 "인가 코드"로 토큰을 받고, 사용자 정보를 가져와 로그인 처리합니다.
// 주소: /auth/kakao/callback  (카카오에 등록한 Redirect URI와 같은 경로)
// ===========================================
import {
  SESSION_COOKIE, STATE_COOKIE, SESSION_DAYS,
  getCookie, makeCookie, getRedirectUri, redirect, signSession,
} from '../lib/session.mjs';

const clearState = (req) => makeCookie(req, STATE_COOKIE, '', 0);
const fail = (req, reason) => redirect(`/?login=${reason}`, [clearState(req)]);

export default async (req) => {
  const url = new URL(req.url);

  // 사용자가 카카오 화면에서 "취소"를 누른 경우
  if (url.searchParams.get('error')) return fail(req, 'cancelled');

  // state 확인: 1단계에서 저장한 번호와 같아야 함
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = getCookie(req, STATE_COOKIE);
  if (!code || !state || state !== savedState) return fail(req, 'invalid');

  try {
    // (1) 인가 코드 → 액세스 토큰(카카오 API를 쓸 수 있는 임시 출입증) 교환
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.KAKAO_REST_API_KEY,
      redirect_uri: getRedirectUri(req),
      code,
    });
    if (process.env.KAKAO_CLIENT_SECRET) {
      body.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
    }

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) {
      // 오류 종류만 기록 (토큰·키 같은 비밀 값은 기록하지 않음)
      console.error('[카카오 토큰 요청 실패]', token.error, token.error_code, token.error_description);
      return fail(req, 'error');
    }

    // (2) 액세스 토큰으로 사용자 정보 가져오기
    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const me = await meRes.json();
    if (!meRes.ok || !me.id) {
      console.error('[카카오 사용자 정보 요청 실패]', me.code, me.msg);
      return fail(req, 'error');
    }

    const profile = me.kakao_account?.profile || {};
    const user = {
      id: String(me.id),
      nickname: profile.nickname || me.properties?.nickname || '카카오 사용자',
      image: profile.thumbnail_image_url || profile.profile_image_url || me.properties?.thumbnail_image || null,
    };

    // (3) 로그인 상태를 서명된 쿠키로 저장하고 첫 화면으로 이동
    const maxAge = SESSION_DAYS * 24 * 60 * 60;
    const session = signSession({ ...user, exp: Date.now() + maxAge * 1000 });
    return redirect('/?login=success', [
      makeCookie(req, SESSION_COOKIE, session, maxAge),
      clearState(req),
    ]);
  } catch (err) {
    console.error('[카카오 로그인 처리 중 오류]', err.message);
    return fail(req, 'error');
  }
};

export const config = { path: '/auth/kakao/callback' };
