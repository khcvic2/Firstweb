// ===========================================
// 날씨 데이터 정리 도구
// OpenWeatherMap의 응답을 화면에 쓰기 좋은 모양으로 바꿉니다.
// ===========================================

const round = (n) => (typeof n === 'number' ? Math.round(n) : null);

// 현재 날씨 (/data/2.5/weather 응답)
export function shapeCurrent(w) {
  const info = w.weather?.[0] || {};
  return {
    dt: w.dt,
    temp: round(w.main?.temp),
    feelsLike: round(w.main?.feels_like),
    tempMin: round(w.main?.temp_min),
    tempMax: round(w.main?.temp_max),
    humidity: w.main?.humidity ?? null,
    pressure: w.main?.pressure ?? null,
    windSpeed: typeof w.wind?.speed === 'number' ? Math.round(w.wind.speed * 10) / 10 : null,
    windDeg: w.wind?.deg ?? null,
    clouds: w.clouds?.all ?? null,
    visibility: w.visibility ?? null,
    description: info.description || '',
    icon: info.icon || null,
    sunrise: w.sys?.sunrise ?? null,
    sunset: w.sys?.sunset ?? null,
  };
}

// 현지 날짜(YYYY-MM-DD)와 시(0~23) 계산 — timezone은 UTC와의 차이(초)
function localParts(dt, timezone) {
  const d = new Date((dt + timezone) * 1000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

// 3시간 간격 예보(/data/2.5/forecast 응답)를 하루 단위로 묶음
export function shapeDaily(forecast) {
  const tz = forecast.city?.timezone ?? 0;
  const days = new Map();

  for (const item of forecast.list || []) {
    const { date, hour } = localParts(item.dt, tz);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push({ ...item, hour });
  }

  return [...days.entries()].map(([date, items]) => {
    const temps = items.flatMap((i) => [i.main?.temp_min, i.main?.temp_max]).filter((n) => typeof n === 'number');
    // 대표 날씨: 낮 12시에 가장 가까운 시간대
    const noon = items.reduce((best, i) => (Math.abs(i.hour - 12) < Math.abs(best.hour - 12) ? i : best), items[0]);
    const info = noon.weather?.[0] || {};
    return {
      date,
      min: round(Math.min(...temps)),
      max: round(Math.max(...temps)),
      pop: Math.round(Math.max(...items.map((i) => i.pop || 0)) * 100), // 강수 확률(%) — 하루 중 가장 높은 값
      description: info.description || '',
      icon: info.icon ? info.icon.replace('n', 'd') : null, // 하루 대표 아이콘은 낮 모양으로
      slots: items.length, // 이 날짜에 포함된 3시간 예보 개수 (첫날·마지막 날은 적을 수 있음)
    };
  });
}

// 앞으로 24시간(3시간 간격 8개) 예보
export function shapeHourly(forecast) {
  return (forecast.list || []).slice(0, 8).map((i) => ({
    dt: i.dt,
    temp: round(i.main?.temp),
    pop: Math.round((i.pop || 0) * 100),
    icon: i.weather?.[0]?.icon || null,
    description: i.weather?.[0]?.description || '',
  }));
}

// 지역 이름: 한국어 이름이 있으면 우선 사용
export function placeName(place) {
  if (!place) return null;
  return place.local_names?.ko || place.name || null;
}
