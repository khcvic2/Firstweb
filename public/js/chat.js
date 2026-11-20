// ===========================================
// 챗봇 페이지: 질문을 서버(/api/chat)로 보내고 GPT 답변을 말풍선으로 표시
// OpenAI API 키는 서버에만 있고, 이 파일에는 없습니다.
// ===========================================
(function () {
  const $ = (id) => document.getElementById(id);
  const chatBox = $('chat');
  const list = $('messages');
  const welcome = $('welcome');
  const loginNeeded = $('login-needed');
  const form = $('composer');
  const input = $('input');
  const sendBtn = $('send-btn');

  const STORAGE_KEY = 'chat-history';
  let history = [];   // [{ role: 'user' | 'assistant', content: '...' }]
  let busy = false;
  let loggedIn = false;

  // 대화 기록을 이 브라우저 탭에만 잠시 저장 (탭을 닫으면 사라짐)
  function save() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch { /* 저장 못 해도 계속 사용 가능 */ }
  }
  function restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) history = saved.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
    } catch { history = []; }
  }

  // 말풍선 만들기 (글자는 textContent로 넣어 해킹 코드가 실행되지 않게 함)
  function addBubble(role, text) {
    const row = document.createElement('div');
    row.className = 'msg ' + role;
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = role === 'error' ? '<i class="bi bi-exclamation-triangle"></i>' : '<i class="bi bi-robot"></i>';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (text !== undefined) bubble.textContent = text;
    row.appendChild(avatar);
    row.appendChild(bubble);
    list.appendChild(row);
    scrollDown();
    return row;
  }
  function addTyping() {
    const row = addBubble('assistant');
    row.querySelector('.bubble').innerHTML = '<span class="typing" aria-label="답변 작성 중"><span></span><span></span><span></span></span>';
    return row;
  }
  function scrollDown() { chatBox.scrollTop = chatBox.scrollHeight; }

  function updateView() {
    welcome.hidden = !loggedIn || history.length > 0;
    loginNeeded.hidden = loggedIn;
    sendBtn.disabled = busy || !loggedIn || !input.value.trim();
    input.disabled = !loggedIn;
    input.placeholder = loggedIn ? '메시지를 입력하세요 (Enter: 보내기, Shift+Enter: 줄바꿈)' : '카카오 로그인 후 사용할 수 있어요';
  }

  // 입력창 높이를 글자 양에 맞게 자동 조절
  function autoSize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy || !loggedIn) return;
    busy = true;

    history.push({ role: 'user', content: text });
    save();
    addBubble('user', text);
    input.value = '';
    autoSize();
    updateView();

    const typing = addTyping();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();

      if (!res.ok) {
        history.pop(); // 실패한 질문은 기록에서 빼서 다시 보낼 수 있게
        save();
        if (data.error === 'login') { loggedIn = false; }
        addBubble('error', data.message || '답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
        input.value = text; // 질문을 입력창에 돌려놓기
        autoSize();
        return;
      }

      history.push({ role: 'assistant', content: data.reply });
      save();
      addBubble('assistant', data.reply);
      if (data.model) $('model-info').textContent = 'GPT 기반 챗봇 · ' + data.model;
    } catch {
      typing.remove();
      history.pop();
      save();
      addBubble('error', '서버에 연결하지 못했습니다. 개발 서버(npm run dev)로 열었는지 확인해 주세요.');
      input.value = text;
      autoSize();
    } finally {
      busy = false;
      updateView();
      input.focus();
    }
  }

  // ===== 이벤트 연결 =====
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', (e) => {
    // Enter: 보내기 / Shift+Enter: 줄바꿈 / 한글 조합 중 Enter는 무시
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener('input', () => { autoSize(); updateView(); });
  $('suggestions').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') send(e.target.textContent);
  });
  $('clear-btn').addEventListener('click', () => {
    if (!history.length || !confirm('대화 내용을 모두 지울까요?')) return;
    history = [];
    save();
    list.innerHTML = '';
    updateView();
  });

  // ===== 처음 열 때: 로그인 확인 → 이전 대화 복원 =====
  restore();
  history.forEach((m) => addBubble(m.role, m.content));
  updateView();

  fetch('/api/me', { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : { loggedIn: false }))
    .then((data) => { loggedIn = !!data.loggedIn; })
    .catch(() => { loggedIn = false; })
    .finally(() => { updateView(); if (loggedIn) input.focus(); });
})();
