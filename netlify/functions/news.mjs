// ===========================================
// 뉴스 가져오기 (newsapi.org)
// API 키는 서버에서만 사용하고, 브라우저에는 절대 보내지 않습니다.
// 주소: /api/news?topic=water-ko  또는  /api/news?q=검색어
// ===========================================
import { getEnv } from '../lib/session.mjs';

const NEWS_API = 'https://newsapi.org/v2';

// 미리 정해둔 주제 (아무 요청이나 대신 보내주지 않도록 서버에서 고정)
const TOPICS = {
  'water-ko': { path: 'everything', params: { q: '수질 OR 수처리 OR 정수장 OR 하수', language: 'ko', sortBy: 'publishedAt' } },
  'env-ko':   { path: 'everything', params: { q: '환경 OR 기후 OR 탄소', language: 'ko', sortBy: 'publishedAt' } },
  'water-en': { path: 'everything', params: { q: '"water quality" OR "water treatment"', language: 'en', sortBy: 'publishedAt' } },
  'science':  { path: 'top-headlines', params: { country: 'us', category: 'science' } },
  'tech':     { path: 'top-headlines', params: { country: 'us', category: 'technology' } },
};
const DEFAULT_TOPIC = 'water-ko';
const PAGE_SIZE = 24;

// newsapi.org 오류 코드를 이해하기 쉬운 말로 바꿈
const ERROR_MESSAGES = {
  apiKeyMissing: '뉴스 API 키가 없습니다.',
  apiKeyInvalid: '뉴스 API 키가 올바르지 않습니다.',
  apiKeyDisabled: '뉴스 API 키가 비활성화되었습니다.',
  apiKeyExhausted: '뉴스 API 사용 한도를 다 썼습니다.',
  rateLimited: '뉴스 API 사용 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.',
  corsNotAllowed: '뉴스 API가 이 요청을 허용하지 않았습니다.',
  parameterInvalid: '검색 조건이 올바르지 않습니다.',
};

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });

export default async (req) => {
  const apiKey = getEnv('NEWS__API_KEY');
  if (!apiKey) {
    console.error('[설정 오류 - news] NEWS__API_KEY 환경 변수가 비어 있습니다.');
    return json({ error: 'config', message: '서버에 뉴스 API 키(NEWS__API_KEY)가 설정되지 않았습니다.' }, 500, { 'Cache-Control': 'no-store' });
  }

  const url = new URL(req.url);
  const keyword = (url.searchParams.get('q') || '').trim().slice(0, 50); // 검색어는 50자까지만
  const topicKey = TOPICS[url.searchParams.get('topic')] ? url.searchParams.get('topic') : DEFAULT_TOPIC;

  // 검색어가 있으면 한국어 기사에서 검색, 없으면 선택한 주제
  const { path, params } = keyword
    ? { path: 'everything', params: { q: keyword, language: 'ko', sortBy: 'publishedAt' } }
    : TOPICS[topicKey];

  const query = new URLSearchParams({ ...params, pageSize: String(PAGE_SIZE) });

  try {
    const res = await fetch(`${NEWS_API}/${path}?${query}`, {
      headers: { 'X-Api-Key': apiKey, 'User-Agent': 'firstweb-news' }, // 키는 주소가 아닌 헤더로 전송
    });
    const data = await res.json();

    if (!res.ok || data.status !== 'ok') {
      console.error('[뉴스 API 오류]', res.status, data.code); // 오류 종류만 기록
      return json(
        { error: data.code || 'unknown', message: ERROR_MESSAGES[data.code] || '뉴스를 가져오지 못했습니다.' },
        502,
        { 'Cache-Control': 'no-store' },
      );
    }

    // 화면에 필요한 정보만 골라서 전달 (삭제된 기사, 주소 없는 기사는 제외)
    const articles = (data.articles || [])
      .filter((a) => a.title && a.title !== '[Removed]' && /^https?:\/\//.test(a.url || ''))
      .map((a) => ({
        title: a.title,
        description: a.description || '',
        url: a.url,
        image: /^https?:\/\//.test(a.urlToImage || '') ? a.urlToImage : null,
        source: a.source?.name || '',
        publishedAt: a.publishedAt || null,
      }));

    return json(
      { topic: keyword ? null : topicKey, keyword: keyword || null, count: articles.length, articles },
      200,
      {
        // 같은 요청은 잠시 저장해 두고 재사용 (무료 요금제 하루 사용 횟수 절약)
        'Cache-Control': 'public, max-age=300',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300',
      },
    );
  } catch (err) {
    console.error('[뉴스 가져오기 실패]', err.message);
    return json({ error: 'network', message: '뉴스 서버에 연결하지 못했습니다.' }, 502, { 'Cache-Control': 'no-store' });
  }
};

export const config = { path: '/api/news' };
