// ===========================================
// 뉴스 페이지: 서버(/api/news)에서 기사를 받아 카드로 그립니다.
// 뉴스 API 키는 서버에만 있고, 이 파일에는 없습니다.
// ===========================================
(function () {
  const grid = document.getElementById('news-grid');
  const statusEl = document.getElementById('status');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');

  const TOPIC_NAMES = {
    'water-ko': '수질·물',
    'env-ko': '환경·기후',
    'water-en': 'Water (영문)',
    science: 'Science',
    tech: 'Tech',
  };

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', !!isError);
  }

  function setActiveTab(topic) {
    tabs.forEach((t) => {
      const on = t.dataset.topic === topic;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  // "3시간 전"처럼 보기 쉬운 시간으로 바꿈
  function timeAgo(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return '방금 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + '일 전';
    return new Date(iso).toLocaleDateString('ko-KR');
  }

  // 요소를 만드는 작은 도우미 (글자는 textContent로 넣어서 해킹 코드가 실행되지 않게 함)
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function placeholderIcon() {
    const i = el('i', 'bi bi-newspaper');
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function makeCard(article) {
    const card = el('a', 'card');
    card.href = article.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    const thumb = el('div', 'card-thumb');
    if (article.image) {
      const img = el('img');
      img.src = article.image;
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { img.remove(); thumb.appendChild(placeholderIcon()); }; // 사진이 깨지면 아이콘으로
      thumb.appendChild(img);
    } else {
      thumb.appendChild(placeholderIcon());
    }

    const body = el('div', 'card-body');
    const meta = el('div', 'card-meta');
    meta.appendChild(el('span', 'card-source', article.source || '출처 미상'));
    const time = el('time', '', timeAgo(article.publishedAt));
    if (article.publishedAt) time.dateTime = article.publishedAt;
    meta.appendChild(time);

    body.appendChild(meta);
    body.appendChild(el('h2', 'card-title', article.title));
    if (article.description) body.appendChild(el('p', 'card-desc', article.description));
    body.appendChild(el('span', 'card-more', '기사 보기 →'));

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  function showSkeleton() {
    grid.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const card = el('div', 'card is-skeleton');
      card.setAttribute('aria-hidden', 'true');
      card.appendChild(el('div', 'card-thumb'));
      const body = el('div', 'card-body');
      body.appendChild(el('div', 'line'));
      body.appendChild(el('div', 'line'));
      body.appendChild(el('div', 'line short'));
      card.appendChild(body);
      grid.appendChild(card);
    }
  }

  let requestId = 0; // 빠르게 탭을 바꿀 때 이전 결과가 늦게 와서 덮어쓰지 않도록

  async function load({ topic, q }) {
    const myId = ++requestId;
    const label = q ? `"${q}" 검색 결과` : TOPIC_NAMES[topic];
    setStatus(`${label} 불러오는 중…`);
    showSkeleton();

    const params = new URLSearchParams(q ? { q } : { topic });
    try {
      const res = await fetch('/api/news?' + params);
      const data = await res.json().catch(() => ({}));
      if (myId !== requestId) return;

      if (!res.ok) {
        grid.innerHTML = '';
        setStatus(data.message || '뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
        return;
      }

      grid.innerHTML = '';
      if (!data.articles.length) {
        setStatus(`${label}: 표시할 기사가 없습니다.`);
        return;
      }
      data.articles.forEach((a) => grid.appendChild(makeCard(a)));
      setStatus(`${label} · ${data.articles.length}건`);
    } catch {
      if (myId !== requestId) return;
      grid.innerHTML = '';
      setStatus('서버에 연결하지 못했습니다. 개발 서버(npm run dev)로 열었는지 확인해 주세요.', true);
    }
  }

  // 주소에 선택 상태를 남겨서 새로고침해도 같은 화면이 보이게 함 (예: news.html?topic=tech)
  function updateUrl(params) {
    history.replaceState(null, '', location.pathname + '?' + new URLSearchParams(params));
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      input.value = '';
      setActiveTab(tab.dataset.topic);
      updateUrl({ topic: tab.dataset.topic });
      load({ topic: tab.dataset.topic });
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    setActiveTab(null);
    updateUrl({ q });
    load({ q });
  });

  // 처음 열 때
  const start = new URLSearchParams(location.search);
  const startQ = (start.get('q') || '').trim();
  const startTopic = TOPIC_NAMES[start.get('topic')] ? start.get('topic') : 'water-ko';
  if (startQ) {
    input.value = startQ;
    setActiveTab(null);
    load({ q: startQ });
  } else {
    setActiveTab(startTopic);
    load({ topic: startTopic });
  }
})();
