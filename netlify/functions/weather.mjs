// ===========================================
// 날씨 가져오기 (openweathermap.org)
// API 키는 서버에서만 사용하고, 브라우저에는 절대 보내지 않습니다.
// 주소: /api/weather?q=인천   또는   /api/weather?lat=37.45&lon=126.70
// ===========================================
import { getEnv } from '../lib/session.mjs';
import { shapeCurrent, shapeDaily, shapeHourly, placeName } from '../lib/weather.mjs';

const OWM = 'https://api.openweathermap.org';
const KEY_NAME = 'weather_API_KEY';

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
const fail = (status, error, message) => json({ error, message }, status, { 'Cache-Control': 'no-store' });

// OpenWeatherMap 오류를 이해하기 쉬운 말로 바꿈
function owmError(status) {
  if (status === 401) {
    return fail(502, 'apiKeyInvalid',
      '날씨 API 키가 올바르지 않거나 아직 활성화되지 않았습니다. (새로 만든 키는 활성화까지 최대 2시간이 걸릴 수 있습니다.)');
  }
  if (status === 429) return fail(502, 'rateLimited', '날씨 API 사용 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.');
  return fail(502, 'upstream', '날씨 정보를 가져오지 못했습니다.');
}

export default async (req) => {
  const apiKey = getEnv(KEY_NAME);
  if (!apiKey) {
    console.error(`[설정 오류 - weather] ${KEY_NAME} 환경 변수가 비어 있습니다.`);
    return fail(500, 'config', `서버에 날씨 API 키(${KEY_NAME})가 설정되지 않았습니다.`);
  }

  // OpenWeatherMap에 요청 (키는 서버 안에서만 붙임)
  const call = async (path, params) => {
    const qs = new URLSearchParams({ ...params, appid: apiKey });
    const res = await fetch(`${OWM}${path}?${qs}`);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  };

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 50);
  // 값이 없으면 NaN이 되도록 (Number(null)은 0이 되어 바다 한가운데 날씨를 부르게 됨)
  let lat = url.searchParams.has('lat') ? Number(url.searchParams.get('lat')) : NaN;
  let lon = url.searchParams.has('lon') ? Number(url.searchParams.get('lon')) : NaN;
  let place = null;

  try {
    // 1) 위치 정하기: 지역 이름이 있으면 좌표로 바꾸고, 좌표가 있으면 그대로 사용
    if (q) {
      let geo = await call('/geo/1.0/direct', { q, limit: '1' });
      if (!geo.ok) return owmError(geo.status);
      if (!geo.data?.length) {
        geo = await call('/geo/1.0/direct', { q: `${q},KR`, limit: '1' }); // 못 찾으면 한국으로 한 번 더
        if (!geo.ok) return owmError(geo.status);
      }
      if (!geo.data?.length) return fail(404, 'notFound', `"${q}" 지역을 찾지 못했습니다. 다른 이름(예: Incheon)으로 검색해 보세요.`);
      place = geo.data[0];
      lat = place.lat;
      lon = place.lon;
    } else if (!(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
      return fail(400, 'badRequest', '지역 이름이나 지도 위치를 선택해 주세요.');
    }

    // 2) 현재 날씨 + 5일 예보 + (좌표로 찾은 경우) 지역 이름을 동시에 요청
    const common = { lat: String(lat), lon: String(lon), units: 'metric', lang: 'kr' };
    const [current, forecast, reverse] = await Promise.all([
      call('/data/2.5/weather', common),
      call('/data/2.5/forecast', common),
      place ? Promise.resolve(null) : call('/geo/1.0/reverse', { lat: String(lat), lon: String(lon), limit: '1' }),
    ]);
    if (!current.ok) return owmError(current.status);
    if (!forecast.ok) return owmError(forecast.status);
    if (!place && reverse?.ok && reverse.data?.length) place = reverse.data[0];

    return json(
      {
        location: {
          name: placeName(place) || current.data.name || '선택한 위치',
          country: place?.country || current.data.sys?.country || '',
          state: place?.state || '',
          lat: Math.round(lat * 10000) / 10000,
          lon: Math.round(lon * 10000) / 10000,
        },
        timezone: forecast.data.city?.timezone ?? current.data.timezone ?? 0,
        current: shapeCurrent(current.data),
        hourly: shapeHourly(forecast.data),
        daily: shapeDaily(forecast.data),
      },
      200,
      {
        // 같은 요청은 10분 동안 저장해 두고 재사용 (무료 요금제 사용 횟수 절약)
        'Cache-Control': 'public, max-age=600',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=600',
      },
    );
  } catch (err) {
    console.error('[날씨 가져오기 실패]', err.message);
    return fail(502, 'network', '날씨 서버에 연결하지 못했습니다.');
  }
};

export const config = { path: '/api/weather' };
