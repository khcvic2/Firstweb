// ===========================================
// 인기 영화 100편 (TMDB - The Movie Database)
// API 키는 서버에서만 사용하고, 브라우저에는 절대 보내지 않습니다.
// 주소: /api/movies?list=popular  (지금 인기)  또는  /api/movies?list=top_rated (역대 평점 TOP)
// ===========================================
import { getEnv } from '../lib/session.mjs';

const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const KEY_NAME = 'TMDB_API_KEY';
// 목록 종류
// - popular: TMDB의 "지금 인기" 순위
// - top_rated: 평가 인원이 적은 영화가 높은 순위에 오르지 않도록
//   "3,000명 이상이 평가한 영화"만 평점 높은 순으로 (기준 인원은 MIN_VOTES로 조절)
const MIN_VOTES = 3000;
const LISTS = {
  popular: { path: '/movie/popular', params: {} },
  top_rated: {
    path: '/discover/movie',
    params: { sort_by: 'vote_average.desc', 'vote_count.gte': String(MIN_VOTES), include_adult: 'false' },
  },
};
const PAGES = 6; // TMDB는 한 페이지에 20편 → 6페이지(120편)를 받아 중복·성인물을 빼고 100편을 채움

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
const fail = (status, error, message) => json({ error, message }, status, { 'Cache-Control': 'no-store' });

export default async (req) => {
  const apiKey = getEnv(KEY_NAME);
  if (!apiKey) {
    console.error(`[설정 오류 - movies] ${KEY_NAME} 환경 변수가 비어 있습니다.`);
    return fail(500, 'config', `서버에 TMDB API 키(${KEY_NAME})가 설정되지 않았습니다.`);
  }

  const listKey = LISTS[new URL(req.url).searchParams.get('list')] ? new URL(req.url).searchParams.get('list') : 'popular';

  // TMDB 요청 (v3 키는 api_key로, v4 읽기 토큰(eyJ...)은 머리글로 보냄)
  const isV4 = apiKey.startsWith('eyJ');
  const tmdb = async (path, params) => {
    const qs = new URLSearchParams({ ...params, ...(isV4 ? {} : { api_key: apiKey }) });
    const res = await fetch(`${TMDB}${path}?${qs}`, {
      headers: { accept: 'application/json', ...(isV4 ? { Authorization: `Bearer ${apiKey}` } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };

  try {
    // 장르 이름표 + 5페이지를 동시에 요청
    const [genreRes, ...pageRes] = await Promise.all([
      tmdb('/genre/movie/list', { language: 'ko' }),
      ...Array.from({ length: PAGES }, (_, i) =>
        tmdb(LISTS[listKey].path, { ...LISTS[listKey].params, language: 'ko-KR', page: String(i + 1) })),
    ]);

    const bad = [genreRes, ...pageRes].find((r) => !r.ok);
    if (bad) {
      console.error('[TMDB 오류]', bad.status, bad.data?.status_code); // 오류 종류만 기록
      if (bad.status === 401) return fail(502, 'apiKeyInvalid', 'TMDB API 키가 올바르지 않습니다.');
      if (bad.status === 429) return fail(502, 'rateLimited', 'TMDB 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      return fail(502, 'upstream', '영화 정보를 가져오지 못했습니다.');
    }

    const genreNames = Object.fromEntries((genreRes.data.genres || []).map((g) => [g.id, g.name]));

    // 페이지가 바뀌는 사이 순위가 바뀌어 같은 영화가 두 번 나올 수 있어 중복 제거
    const seen = new Set();
    const movies = pageRes
      .flatMap((r) => r.data.results || [])
      .filter((m) => !m.adult) // 성인 영화 제외
      .filter((m) => (seen.has(m.id) ? false : seen.add(m.id)))
      .slice(0, 100)
      .map((m, i) => ({
        rank: i + 1,
        id: m.id,
        title: m.title || m.original_title,
        originalTitle: m.original_title !== m.title ? m.original_title : null,
        overview: m.overview || '',
        releaseDate: m.release_date || null,
        rating: typeof m.vote_average === 'number' ? Math.round(m.vote_average * 10) / 10 : null,
        voteCount: m.vote_count ?? 0,
        poster: m.poster_path ? `${IMG}/w342${m.poster_path}` : null,
        backdrop: m.backdrop_path ? `${IMG}/w780${m.backdrop_path}` : null,
        genres: (m.genre_ids || []).map((id) => genreNames[id]).filter(Boolean),
      }));

    return json(
      { list: listKey, minVotes: listKey === 'top_rated' ? MIN_VOTES : null, count: movies.length, movies },
      200,
      {
        // 순위는 자주 바뀌지 않으므로 1시간 저장해 두고 재사용
        'Cache-Control': 'public, max-age=1800',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
      },
    );
  } catch (err) {
    console.error('[영화 정보 가져오기 실패]', err.message);
    return fail(502, 'network', 'TMDB 서버에 연결하지 못했습니다.');
  }
};

export const config = { path: '/api/movies' };
