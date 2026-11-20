// ===========================================
// GPT 챗봇 (OpenAI Responses API)
// - 카카오 로그인한 사용자만 사용 가능 (모르는 사람이 요금을 쓰지 못하게)
// - OpenAI API 키는 서버에서만 사용하고, 브라우저에는 절대 보내지 않습니다.
// 주소: POST /api/chat   본문: { "messages": [ { "role": "user", "content": "..." }, ... ] }
// ===========================================
import crypto from 'node:crypto';
import { getEnv, getCookie, verifySession, SESSION_COOKIE } from '../lib/session.mjs';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-6-luna'; // OpenAI 공식 문서의 "비용 효율" 모델. .env의 GPT_MODEL로 바꿀 수 있음
// ※ 변수 이름을 OPENAI_API_KEY로 하지 않는 이유:
//   Netlify의 AI Gateway 기능이 OPENAI_API_KEY를 자체 값으로 덮어써서 .env의 값이 무시되기 때문
const KEY_NAME = 'GPT_API_KEY';
const MODEL_NAME = 'GPT_MODEL';
const MAX_MESSAGES = 20;   // 대화 기록은 최근 20개까지만 보냄 (요금 절약)
const MAX_CHARS = 2000;    // 메시지 하나당 최대 글자 수
const TIMEOUT_MS = 25000;  // 25초 안에 답이 없으면 중단

// 챗봇의 역할과 말투 (사용자에게는 보이지 않는 지시문)
const INSTRUCTIONS = `당신은 "시약관리 플랫폼"의 한국어 도우미입니다.
- 실험실 시약·화학물질의 보관, 취급, 재고 관리, MSDS(물질안전보건자료) 읽는 법, 관련 법규(화학물질관리법, 산업안전보건법 등)의 개념을 쉽게 설명합니다.
- 일반적인 질문에도 친절하게 답합니다.
- 코딩을 처음 배우는 사람도 이해할 수 있도록 쉬운 말로, 전문용어에는 짧은 설명을 붙입니다.
- 확실하지 않은 내용은 추측하지 말고 "확인되지 않았다"고 말합니다.
- 유해성·응급조치 등 안전과 직결된 내용은 반드시 해당 물질의 공식 MSDS와 전문가 확인을 권합니다.
- 위험물질의 불법 제조나 사람에게 해를 끼치는 방법은 안내하지 않습니다.
- 답변은 핵심부터, 너무 길지 않게 작성합니다.`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
const fail = (status, error, message) => json({ error, message }, status);

// 브라우저가 보낸 대화 기록 검사 (형식이 이상하면 거절)
function cleanMessages(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const list = raw.slice(-MAX_MESSAGES).map((m) => ({
    role: m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null,
    content: typeof m?.content === 'string' ? m.content.trim() : '',
  }));
  if (list.some((m) => !m.role || !m.content || m.content.length > MAX_CHARS)) return null;
  if (list[list.length - 1].role !== 'user') return null; // 마지막은 사용자 질문이어야 함
  return list;
}

// 응답에서 글자만 모으기 (output 배열에 추론 기록 등 다른 항목이 섞여 있을 수 있음)
function extractText(data) {
  return (data.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n')
    .trim();
}

export default async (req) => {
  if (req.method !== 'POST') return fail(405, 'method', 'POST 요청만 받습니다.');

  // 1) 로그인 확인
  const user = verifySession(getCookie(req, SESSION_COOKIE));
  if (!user) return fail(401, 'login', '챗봇은 카카오 로그인 후 사용할 수 있습니다.');

  // 2) 설정 확인
  const apiKey = getEnv(KEY_NAME);
  if (!apiKey) {
    console.error(`[설정 오류 - chat] ${KEY_NAME} 환경 변수가 비어 있습니다.`);
    return fail(500, 'config', `서버에 OpenAI API 키(${KEY_NAME})가 설정되지 않았습니다.`);
  }

  // 3) 요청 내용 확인
  const body = await req.json().catch(() => null);
  const messages = cleanMessages(body?.messages);
  if (!messages) return fail(400, 'badRequest', `메시지 형식이 올바르지 않습니다. (한 번에 ${MAX_CHARS}자까지)`);

  // 4) OpenAI에 요청
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: getEnv(MODEL_NAME) || DEFAULT_MODEL,
        instructions: INSTRUCTIONS,
        input: messages,
        reasoning: { effort: 'low' },  // 빠른 답변을 위해 생각하는 양을 적게
        max_output_tokens: 1500,       // 답변 길이 상한 (요금 절약)
        store: false,                  // OpenAI 쪽에 대화를 저장하지 않음
        // 사용자를 구분하는 익명 값 (카카오 ID를 그대로 보내지 않고 암호화)
        safety_identifier: crypto.createHash('sha256').update(`kakao:${user.id}`).digest('hex').slice(0, 32),
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 오류 종류만 기록 (키·대화 내용은 기록하지 않음)
      console.error('[OpenAI 오류]', res.status, data?.error?.type, data?.error?.code);
      if (res.status === 401) return fail(502, 'apiKeyInvalid', 'OpenAI API 키가 올바르지 않습니다.');
      if (res.status === 429) return fail(502, 'rateLimited', 'OpenAI 사용 한도를 넘었거나 크레딧이 부족합니다. 잠시 후 다시 시도하거나 결제 상태를 확인해 주세요.');
      if (res.status === 404 || data?.error?.code === 'model_not_found') return fail(502, 'model', `설정된 GPT 모델을 사용할 수 없습니다. ${MODEL_NAME} 값을 확인해 주세요.`);
      return fail(502, 'upstream', 'GPT 답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }

    const reply = extractText(data);
    if (!reply) {
      const why = data.status === 'incomplete' ? ' (답변이 너무 길어 중간에 멈췄습니다)' : '';
      return fail(502, 'empty', `GPT가 빈 답변을 보냈습니다.${why} 질문을 조금 바꿔 다시 시도해 주세요.`);
    }
    return json({ reply, model: data.model || null, incomplete: data.status === 'incomplete' });
  } catch (err) {
    if (err.name === 'AbortError') return fail(504, 'timeout', '답변이 너무 오래 걸려 중단했습니다. 질문을 짧게 나눠 다시 시도해 주세요.');
    console.error('[챗봇 처리 실패]', err.message);
    return fail(502, 'network', 'OpenAI 서버에 연결하지 못했습니다.');
  } finally {
    clearTimeout(timer);
  }
};

export const config = { path: '/api/chat' };
