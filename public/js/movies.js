// ===========================================
// 인기 영화 페이지: 서버(/api/movies)에서 100편을 받아 포스터 카드로 표시
// TMDB API 키는 서버에만 있고, 이 파일에는 없습니다.
// ===========================================
(function () {
  const $ = (id) => document.getElementById(id);
  const grid = $('grid');
  const statusEl = $('status');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const searchInput = $('search-input');
  const genresBox = $('genres');
  const modal = $('modal');

  const LIST_NAMES = { popular: '지금 인기', top_rated: '역대 평점 TOP' };
  const cache = {};          // 한 번 받은 목록은 다시 요청하지 않음
  let movies = [];
  let currentList = 'popular';
  let currentGenre = '전체';

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', !!isError);
  }

  // 요소 만들기 도우미 (글자는 textContent로 넣어 해킹 코드 실행 방지)
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  const year = (d) => (d ? d.slice(0, 4) : '');

  function posterBox(m) {
    const box = el('div', 'poster');
    if (m.poster) {
      const img = el('img');
      img.src = m.poster;
      img.alt = `${m.title} 포스터`;
      img.loading = 'lazy';
      img.onerror = () => { img.remove(); box.appendChild(el('i', 'bi bi-film')); };
      box.appendChild(img);
    } else {
      box.appendChild(el('i', 'bi bi-film'));
    }
    return box;
  }

  function makeCard(m) {
    const li = el('li');
    const btn = el('button', 'movie');
    btn.type = 'button';
    btn.setAttribute('aria-label', `${m.rank}위 ${m.title} 자세히 보기`);
    btn.appendChild(posterBox(m));
    btn.appendChild(el('span', 'rank' + (m.rank <= 3 ? ' top3' : ''), m.rank));

    const info = el('div', 'movie-info');
    info.appendChild(el('span', 'movie-title', m.title));
    const meta = el('div', 'movie-meta');
    meta.appendChild(el('span', '', year(m.releaseDate)));
    meta.appendChild(el('span', 'star', m.rating !== null ? `★ ${m.rating.toFixed(1)}` : ''));
    info.appendChild(meta);
    btn.appendChild(info);

    btn.addEventListener('click', () => openModal(m));
    li.appendChild(btn);
    return li;
  }

  function showSkeleton() {
    grid.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const li = el('li');
      const card = el('div', 'movie is-skeleton');
      card.setAttribute('aria-hidden', 'true');
      card.appendChild(el('div', 'poster'));
      const info = el('div', 'movie-info');
      info.appendChild(el('div', 'line'));
      info.appendChild(el('div', 'line short'));
      card.appendChild(info);
      li.appendChild(card);
      grid.appendChild(li);
    }
  }

  // ===== 장르 버튼 =====
  function renderGenres() {
    const counts = {};
    movies.forEach((m) => m.genres.forEach((g) => { counts[g] = (counts[g] || 0) + 1; }));
    const names = ['전체', ...Object.keys(counts).sort((a, b) => counts[b] - counts[a])];
    if (!names.includes(currentGenre)) currentGenre = '전체';

    genresBox.innerHTML = '';
    names.forEach((name) => {
      const b = el('button', 'genre' + (name === currentGenre ? ' is-active' : ''), name === '전체' ? '전체' : `${name} ${counts[name]}`);
      b.type = 'button';
      b.addEventListener('click', () => {
        currentGenre = name;
        genresBox.querySelectorAll('.genre').forEach((x) => x.classList.toggle('is-active', x === b));
        render();
      });
      genresBox.appendChild(b);
    });
  }

  // ===== 목록 그리기 (장르·검색어 반영) =====
  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const shown = movies.filter((m) =>
      (currentGenre === '전체' || m.genres.includes(currentGenre)) &&
      (!q || m.title.toLowerCase().includes(q) || (m.originalTitle || '').toLowerCase().includes(q))
    );
    grid.innerHTML = '';
    shown.forEach((m) => grid.appendChild(makeCard(m)));

    const filters = [currentGenre !== '전체' ? currentGenre : '', q ? `"${searchInput.value.trim()}"` : ''].filter(Boolean).join(' · ');
    const basis = currentList === 'top_rated' ? ' (3,000명 이상 평가한 영화 기준)' : '';
    setStatus(shown.length
      ? `${LIST_NAMES[currentList]} ${movies.length}편${basis}${filters ? ` 중 ${filters} ${shown.length}편` : ''}`
      : `${filters} 조건에 맞는 영화가 없어요.`);
  }

  // ===== 서버에서 목록 가져오기 =====
  let requestId = 0;
  async function load(list) {
    currentList = list;
    tabs.forEach((t) => {
      const on = t.dataset.list === list;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    history.replaceState(null, '', location.pathname + '?list=' + list);

    if (cache[list]) { movies = cache[list]; renderGenres(); render(); return; }

    const myId = ++requestId;
    setStatus(`${LIST_NAMES[list]} 영화 불러오는 중…`);
    genresBox.innerHTML = '';
    showSkeleton();
    try {
      const res = await fetch('/api/movies?list=' + list);
      const data = await res.json().catch(() => ({}));
      if (myId !== requestId) return;
      if (!res.ok) {
        grid.innerHTML = '';
        setStatus(data.message || '영화 정보를 가져오지 못했습니다.', true);
        return;
      }
      cache[list] = data.movies;
      movies = data.movies;
      renderGenres();
      render();
    } catch {
      if (myId !== requestId) return;
      grid.innerHTML = '';
      setStatus('서버에 연결하지 못했습니다. 개발 서버(npm run dev)로 열었는지 확인해 주세요.', true);
    }
  }

  // ===== 자세히 보기 창 =====
  function openModal(m) {
    $('modal-backdrop').style.backgroundImage = m.backdrop ? `url("${m.backdrop}")` : '';
    const poster = $('modal-poster');
    if (m.poster) { poster.src = m.poster; poster.alt = `${m.title} 포스터`; } else { poster.removeAttribute('src'); poster.alt = ''; }
    $('modal-rank').textContent = `${LIST_NAMES[currentList]} ${m.rank}위`;
    $('modal-title').textContent = m.title;
    $('modal-original').textContent = m.originalTitle || '';
    const meta = [];
    if (m.releaseDate) meta.push(`개봉 ${m.releaseDate}`);
    if (m.rating !== null) meta.push(`★ ${m.rating.toFixed(1)} (${m.voteCount.toLocaleString('ko-KR')}명 평가)`);
    $('modal-meta').textContent = meta.join(' · ');
    const g = $('modal-genres');
    g.innerHTML = '';
    m.genres.forEach((name) => g.appendChild(el('span', '', name)));
    $('modal-overview').textContent = m.overview || '한국어 줄거리 정보가 아직 없어요.';
    $('modal-link').href = `https://www.themoviedb.org/movie/${m.id}?language=ko-KR`;
    modal.showModal();
  }
  $('modal-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); }); // 바깥 누르면 닫기

  // ===== 이벤트 연결 =====
  tabs.forEach((t) => t.addEventListener('click', () => load(t.dataset.list)));
  searchInput.addEventListener('input', render);

  // 처음 열 때 (주소에 ?list=top_rated가 있으면 그 목록)
  const startList = new URLSearchParams(location.search).get('list');
  load(LIST_NAMES[startList] ? startList : 'popular');
})();
