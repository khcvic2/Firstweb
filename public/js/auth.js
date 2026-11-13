// ===========================================
// 화면 오른쪽 위 로그인 영역을 그리는 코드
// - 로그인 안 됨: "카카오 로그인" 버튼
// - 로그인 됨: 프로필 사진 + 닉네임 + 로그아웃 버튼
// ===========================================
(function () {
  const box = document.getElementById('auth-bar');
  if (!box) return;

  const MESSAGES = {
    success: '로그인되었습니다.',
    logout: '로그아웃되었습니다.',
    cancelled: '로그인이 취소되었습니다.',
    invalid: '잘못된 로그인 요청입니다. 다시 시도해 주세요.',
    error: '로그인 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.',
  };

  // 카카오 말풍선 모양 아이콘
  const KAKAO_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.84 5.32 4.62 6.74l-.96 3.5c-.08.3.26.54.52.37l4.13-2.73c.55.07 1.11.12 1.69.12 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/></svg>';

  function showLoginButton() {
    box.innerHTML =
      '<a class="kakao-btn" href="/auth/kakao/login">' + KAKAO_ICON + '<span>카카오 로그인</span></a>';
  }

  function showUser(user) {
    box.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'user-chip';

    if (user.image) {
      const img = document.createElement('img');
      img.src = user.image;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      wrap.appendChild(img);
    }
    const name = document.createElement('span');
    name.textContent = user.nickname + '님'; // textContent: 글자로만 표시(해킹 코드 실행 방지)
    wrap.appendChild(name);

    const out = document.createElement('a');
    out.href = '/auth/logout';
    out.className = 'logout-btn';
    out.textContent = '로그아웃';
    wrap.appendChild(out);

    box.appendChild(wrap);
  }

  // 로그인 결과 알림 (주소 끝 ?login=... 을 읽어서 표시 후 주소에서 지움)
  function showToast() {
    const params = new URLSearchParams(location.search);
    const key = params.get('login');
    if (!key || !MESSAGES[key]) return;

    const toast = document.createElement('div');
    toast.className = 'auth-toast' + (['success', 'logout'].includes(key) ? '' : ' is-error');
    toast.setAttribute('role', 'status');
    toast.textContent = MESSAGES[key];
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);

    params.delete('login');
    const rest = params.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  }

  showToast();

  fetch('/api/me', { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : { loggedIn: false }))
    .then((data) => (data.loggedIn ? showUser(data.user) : showLoginButton()))
    .catch(showLoginButton);
})();
