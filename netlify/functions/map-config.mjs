// ===========================================
// 카카오맵 설정 전달
// 카카오맵은 브라우저에서 JavaScript 키가 필요합니다.
// 이 키는 원래 공개용이며, 카카오 디벨로퍼스에 "등록한 사이트 도메인"에서만 작동합니다.
// (REST API 키·Client Secret 같은 비밀 값은 절대 여기서 보내지 않습니다.)
// 주소: /api/map-config
// ===========================================
import { getEnv } from '../lib/session.mjs';

export default async () => {
  const kakaoJsKey = getEnv('KAKAO_JAVASCRIPT_KEY');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

  if (!kakaoJsKey) {
    console.error('[설정 오류 - map-config] KAKAO_JAVASCRIPT_KEY 환경 변수가 비어 있습니다.');
    return new Response(
      JSON.stringify({ error: 'config', message: '서버에 카카오 JavaScript 키(KAKAO_JAVASCRIPT_KEY)가 설정되지 않았습니다.' }),
      { status: 500, headers },
    );
  }
  return new Response(JSON.stringify({ kakaoJsKey }), { headers });
};

export const config = { path: '/api/map-config' };
