// ===========================================
// 로그인 상태(세션)와 쿠키를 다루는 공통 도구
// - 여러 서버 함수(Netlify Functions)가 함께 사용합니다.
// ===========================================
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'session';
export const STATE_COOKIE = 'kakao_state';
export const SESSION_DAYS = 7; // 로그인 유지 기간(일)

// 비밀 문자열로 서명(위조 방지 도장)을 만듭니다.
function makeSignature(text) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET 환경 변수가 설정되지 않았습니다.');
  return crypto.createHmac('sha256', secret).update(text).digest('base64url');
}

// 사용자 정보를 "내용.서명" 형태의 문자열로 만듭니다.
export function signSession(data) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${makeSignature(body)}`;
}

// 쿠키 문자열을 검사해서, 위조되지 않았고 기간이 남아 있으면 사용자 정보를 돌려줍니다.
export function verifySession(token) {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = makeSignature(body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null; // 기간 만료
    return data;
  } catch {
    return null;
  }
}

// 요청에서 특정 이름의 쿠키 값을 꺼냅니다.
export function getCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return null;
}

// 브라우저에 저장할 쿠키 문자열을 만듭니다.
// HttpOnly: 웹페이지의 자바스크립트가 읽을 수 없음(해킹 방지)
// SameSite=Lax: 다른 사이트에서 몰래 보내는 요청을 막음
// Secure: https 주소에서만 전송 (내 컴퓨터 테스트용 http에서는 끔)
export function makeCookie(req, name, value, maxAgeSeconds) {
  const secure = new URL(req.url).protocol === 'https:';
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

// 카카오 로그인 후 돌아올 주소(Redirect URI)를 정합니다.
// - 내 컴퓨터(localhost)에서 테스트할 때: http://localhost:8888/auth/kakao/callback
// - Netlify에 배포했을 때: .env(또는 Netlify 환경 변수)의 KAKAO_REDIRECT_URI
export function getRedirectUri(req) {
  const url = new URL(req.url);
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (!isLocal && process.env.KAKAO_REDIRECT_URI) {
    return process.env.KAKAO_REDIRECT_URI;
  }
  return `${url.origin}/auth/kakao/callback`;
}

// 다른 주소로 이동시키는 응답을 만듭니다. (쿠키 여러 개 저장 가능)
export function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}
