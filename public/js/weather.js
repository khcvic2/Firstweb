// ===========================================
// 날씨 페이지: 지역 검색·지도 선택 → 서버(/api/weather)에서 날씨를 받아 표시
// 날씨 API 키는 서버에만 있고, 이 파일에는 없습니다.
// ===========================================
(function () {
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const form = $('search-form');
  const input = $('search-input');

  // 주요 도시 (좌표로 바로 조회 — 이름 검색보다 정확함)
  const CITIES = [
    { name: '서울', lat: 37.5665, lon: 126.978 },
    { name: '인천', lat: 37.4563, lon: 126.7052 },
    { name: '수원', lat: 37.2636, lon: 127.0286 },
    { name: '대전', lat: 36.3504, lon: 127.3845 },
    { name: '대구', lat: 35.8714, lon: 128.6014 },
    { name: '광주', lat: 35.1595, lon: 126.8526 },
    { name: '부산', lat: 35.1796, lon: 129.0756 },
    { name: '강릉', lat: 37.7519, lon: 128.8761 },
    { name: '제주', lat: 33.4996, lon: 126.5312 },
  ];

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const iconUrl = (code) => `https://openweathermap.org/img/wn/${code}@2x.png`;

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', !!isError);
  }

  // 요소를 만드는 도우미 (글자는 textContent로 넣어 해킹 코드 실행 방지)
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function icon(code, alt) {
    const img = el('img');
    if (code) img.src = iconUrl(code);
    img.alt = alt || '';
    img.width = 44; img.height = 44;
    return img;
  }

  // 현지 시각 계산 (timezone: UTC와의 차이, 초)
  function localDate(unix, tz) { return new Date((unix + tz) * 1000); }
  const pad = (n) => String(n).padStart(2, '0');
  function hhmm(unix, tz) { const d = localDate(unix, tz); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }
  function windDir(deg) {
    if (deg === null || deg === undefined) return '';
    return ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round(deg / 45) % 8] + '풍';
  }

  // ===== 카카오맵 준비 =====
  // 1) 서버에서 JavaScript 키를 받고 → 2) 카카오맵 프로그램을 불러오고 → 3) 지도를 그림
  const mapBox = $('map');
  let map = null;
  let marker = null;
  let labelOverlay = null;
  let pendingMarker = null; // 지도가 준비되기 전에 날씨가 먼저 오면 잠시 보관

  function mapError(text) {
    mapBox.classList.add('map-error');
    mapBox.textContent = text;
  }

  function loadKakaoSdk(key) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=' + encodeURIComponent(key);
      s.onload = () => (window.kakao && kakao.maps ? kakao.maps.load(resolve) : reject(new Error('sdk')));
      s.onerror = () => reject(new Error('sdk'));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('timeout')), 10000); // 10초 안에 안 되면 실패 처리
    });
  }

  async function initMap() {
    try {
      const res = await fetch('/api/map-config');
      const cfg = await res.json().catch(() => ({}));
      if (!res.ok || !cfg.kakaoJsKey) throw new Error(cfg.message || 'config');
      await loadKakaoSdk(cfg.kakaoJsKey);
    } catch (err) {
      mapError(
        err.message && err.message.includes('KAKAO_JAVASCRIPT_KEY')
          ? err.message
          : '카카오맵을 불러오지 못했습니다. 카카오 디벨로퍼스에 이 사이트 주소가 등록되어 있는지 확인해 주세요. (검색과 도시 버튼은 사용할 수 있어요)'
      );
      return;
    }

    map = new kakao.maps.Map(mapBox, {
      center: new kakao.maps.LatLng(36.3, 127.8), // 한국 중심
      level: 13, // 숫자가 클수록 넓게 보임 (1~14)
    });
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

    kakao.maps.event.addListener(map, 'click', (e) => {
      clearChips();
      load({ lat: e.latLng.getLat(), lon: e.latLng.getLng() });
    });
    // 화면 크기가 바뀌면 지도 크기도 다시 맞춤
    window.addEventListener('resize', () => map.relayout());

    if (pendingMarker) placeMarker(...pendingMarker);
  }

  function placeMarker(lat, lon, label) {
    if (!map) { pendingMarker = [lat, lon, label]; return; }
    const pos = new kakao.maps.LatLng(lat, lon);

    if (!marker) marker = new kakao.maps.Marker({ map, position: pos });
    else marker.setPosition(pos);

    // 마커 위 이름표 (글자는 textContent로 넣어 안전하게)
    const tag = el('div', 'map-label', label);
    if (!labelOverlay) {
      labelOverlay = new kakao.maps.CustomOverlay({ map, position: pos, content: tag, yAnchor: 2.6 });
    } else {
      labelOverlay.setContent(tag);
      labelOverlay.setPosition(pos);
    }

    if (map.getLevel() > 9) map.setLevel(9, { animate: true });
    map.panTo(pos);
  }

  initMap();

  // ===== 주요 도시 버튼 =====
  const chipsBox = $('chips');
  CITIES.forEach((c) => {
    const b = el('button', 'chip', c.name);
    b.type = 'button';
    b.addEventListener('click', () => {
      clearChips();
      b.classList.add('is-active');
      input.value = '';
      load({ lat: c.lat, lon: c.lon, label: c.name });
    });
    chipsBox.appendChild(b);
  });
  function clearChips() { chipsBox.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active')); }

  // ===== 화면 그리기 =====
  function renderCurrent(data) {
    const { location: loc, current: c, timezone: tz } = data;
    const label = data.label || loc.name;
    $('place').textContent = label + (loc.country && loc.country !== 'KR' ? `, ${loc.country}` : '');
    $('updated').textContent = `현지 시각 ${hhmm(c.dt, tz)} 기준`;
    const ic = $('current-icon');
    if (c.icon) { ic.src = iconUrl(c.icon); ic.alt = c.description; } else { ic.removeAttribute('src'); }
    $('temp').textContent = `${c.temp}°`;
    $('desc').textContent = c.description;
    $('range').textContent = `체감 ${c.feelsLike}° · 최저 ${c.tempMin}° / 최고 ${c.tempMax}°`;

    const items = [
      ['bi-droplet', '습도', c.humidity !== null ? `${c.humidity}%` : '-'],
      ['bi-wind', '바람', c.windSpeed !== null ? `${windDir(c.windDeg)} ${c.windSpeed}m/s` : '-'],
      ['bi-clouds', '구름', c.clouds !== null ? `${c.clouds}%` : '-'],
      ['bi-speedometer2', '기압', c.pressure !== null ? `${c.pressure}hPa` : '-'],
      ['bi-eye', '가시거리', c.visibility !== null ? `${(c.visibility / 1000).toFixed(1)}km` : '-'],
      ['bi-sunrise', '일출 · 일몰', c.sunrise ? `${hhmm(c.sunrise, tz)} · ${hhmm(c.sunset, tz)}` : '-'],
    ];
    const dl = $('details');
    dl.innerHTML = '';
    items.forEach(([ico, name, value]) => {
      const box = el('div');
      const dt = el('dt');
      const i = el('i', `bi ${ico}`); i.setAttribute('aria-hidden', 'true');
      dt.appendChild(i); dt.appendChild(document.createTextNode(name));
      box.appendChild(dt);
      box.appendChild(el('dd', '', value));
      dl.appendChild(box);
    });
    $('current').hidden = false;
  }

  function renderHourly(data) {
    const box = $('hourly');
    box.innerHTML = '';
    data.hourly.forEach((h) => {
      const item = el('div', 'hour');
      item.appendChild(el('span', '', `${localDate(h.dt, data.timezone).getUTCHours()}시`));
      item.appendChild(icon(h.icon, h.description));
      item.appendChild(el('strong', '', `${h.temp}°`));
      item.appendChild(el('span', 'pop', h.pop ? `☔ ${h.pop}%` : ' '));
      box.appendChild(item);
    });
    $('hourly-panel').hidden = !data.hourly.length;
  }

  function renderDaily(data) {
    const list = $('daily');
    list.innerHTML = '';
    const today = localDate(data.current.dt, data.timezone).toISOString().slice(0, 10);
    data.daily.forEach((d) => {
      const date = new Date(d.date + 'T00:00:00Z');
      const li = el('li', 'day');
      const name = el('span', 'day-name', d.date === today ? '오늘' : `${WEEKDAYS[date.getUTCDay()]}요일`);
      name.appendChild(el('small', '', `${date.getUTCMonth() + 1}/${date.getUTCDate()}`));
      li.appendChild(name);
      li.appendChild(icon(d.icon, d.description));
      const desc = el('span', 'day-desc', d.description);
      if (d.pop) { desc.appendChild(document.createTextNode(' ')); desc.appendChild(el('span', 'pop', `☔ ${d.pop}%`)); }
      li.appendChild(desc);
      const temp = el('span', 'day-temp');
      temp.appendChild(el('span', 'min', `${d.min}°`));
      temp.appendChild(document.createTextNode(' / '));
      temp.appendChild(el('span', 'max', `${d.max}°`));
      li.appendChild(temp);
      list.appendChild(li);
    });
    $('daily-panel').hidden = !data.daily.length;
  }

  function hideResults() {
    ['current', 'hourly-panel', 'daily-panel'].forEach((id) => { $(id).hidden = true; });
  }

  // ===== 서버에서 날씨 가져오기 =====
  let requestId = 0; // 빠르게 여러 번 누를 때 이전 결과가 덮어쓰지 않도록

  async function load({ q, lat, lon, label }) {
    const myId = ++requestId;
    setStatus('날씨 불러오는 중…');
    const params = q ? { q } : { lat: lat.toFixed(4), lon: lon.toFixed(4) };

    try {
      const res = await fetch('/api/weather?' + new URLSearchParams(params));
      const data = await res.json().catch(() => ({}));
      if (myId !== requestId) return;

      if (!res.ok) {
        hideResults();
        setStatus(data.message || '날씨를 가져오지 못했습니다.', true);
        return;
      }
      if (label) data.label = label;
      renderCurrent(data);
      renderHourly(data);
      renderDaily(data);
      setStatus('');
      placeMarker(data.location.lat, data.location.lon, data.label || data.location.name);
      history.replaceState(null, '', location.pathname + '?' + new URLSearchParams(q ? { q } : { lat: params.lat, lon: params.lon }));
    } catch {
      if (myId !== requestId) return;
      hideResults();
      setStatus('서버에 연결하지 못했습니다. 개발 서버(npm run dev)로 열었는지 확인해 주세요.', true);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    clearChips();
    load({ q });
  });

  // ===== 처음 열 때: 주소에 지역이 있으면 그곳, 없으면 서울 =====
  const start = new URLSearchParams(location.search);
  const sq = (start.get('q') || '').trim();
  const slat = Number(start.get('lat'));
  const slon = Number(start.get('lon'));
  if (sq) {
    input.value = sq;
    load({ q: sq });
  } else if (start.has('lat') && Number.isFinite(slat) && Number.isFinite(slon)) {
    load({ lat: slat, lon: slon });
  } else {
    chipsBox.firstChild.classList.add('is-active');
    load({ ...CITIES[0], label: CITIES[0].name });
  }
})();
