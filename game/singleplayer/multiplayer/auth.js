(function () {
  const SERVER_URL = 'https://multipixel-yzoq.onrender.com';
  const AUTH_STORAGE_KEY = 'multipixel.1d4p.auth';

  let authState = null;
  let authPromise = null;

  function readStoredAuth() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.username || !parsed?.token) return null;
      return { username: String(parsed.username), token: String(parsed.token) };
    } catch {
      return null;
    }
  }

  function saveAuth(next) {
    authState = next;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
  }

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'mp-auth-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:#7a7a7a', 'z-index:999999',
      'display:flex', 'align-items:center', 'justify-content:center', 'font-family:monospace'
    ].join(';');

    overlay.innerHTML = `
      <div style="width:min(92vw,430px); background:#d9d9d9; border:3px solid #333; padding:16px; color:#111;">
        <h2 style="margin:0 0 10px 0;">1d4p Account</h2>
        <div style="display:flex; gap:8px; margin-bottom:10px;">
          <button id="mp-auth-tab-register" type="button">Register</button>
          <button id="mp-auth-tab-login" type="button">Log in</button>
        </div>
        <form id="mp-auth-form" style="display:flex; flex-direction:column; gap:8px;">
          <input id="mp-auth-username" placeholder="username" required minlength="3" maxlength="24" />
          <input id="mp-auth-password" placeholder="password" type="password" required minlength="6" />
          <input id="mp-auth-password-again" placeholder="password again" type="password" minlength="6" />
          <label id="mp-auth-robot-wrap" style="display:flex;align-items:center;gap:8px; font-size:13px;">
            <input id="mp-auth-robot" type="checkbox" />
            <span>I'm not a robot</span>
          </label>
          <button id="mp-auth-submit" type="submit">Create account</button>
          <div id="mp-auth-error" style="min-height:18px; color:#8b0000; font-size:12px;"></div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const form = overlay.querySelector('#mp-auth-form');
    const tabRegister = overlay.querySelector('#mp-auth-tab-register');
    const tabLogin = overlay.querySelector('#mp-auth-tab-login');
    const inputUsername = overlay.querySelector('#mp-auth-username');
    const inputPassword = overlay.querySelector('#mp-auth-password');
    const inputPasswordAgain = overlay.querySelector('#mp-auth-password-again');
    const inputRobot = overlay.querySelector('#mp-auth-robot');
    const robotWrap = overlay.querySelector('#mp-auth-robot-wrap');
    const submitBtn = overlay.querySelector('#mp-auth-submit');
    const errorEl = overlay.querySelector('#mp-auth-error');

    let mode = 'register';

    function setMode(nextMode) {
      mode = nextMode;
      const isRegister = mode === 'register';
      inputPasswordAgain.style.display = isRegister ? '' : 'none';
      robotWrap.style.display = isRegister ? 'flex' : 'none';
      submitBtn.textContent = isRegister ? 'Create account' : 'Log in';
      tabRegister.disabled = isRegister;
      tabLogin.disabled = !isRegister;
      errorEl.textContent = '';
    }

    async function doAuth(event) {
      event.preventDefault();
      const username = String(inputUsername.value || '').trim().toLowerCase();
      const password = String(inputPassword.value || '');
      const passwordAgain = String(inputPasswordAgain.value || '');
      const notRobot = !!inputRobot.checked;
      errorEl.textContent = '';

      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      try {
        const res = await fetch(`${SERVER_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, passwordAgain, notRobot }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.ok) {
          errorEl.textContent = payload?.error || 'Auth failed.';
          return;
        }
        saveAuth({ username: payload.username, token: payload.token });
        overlay.remove();
      } catch {
        errorEl.textContent = 'Could not reach auth server.';
      }
    }

    tabRegister.addEventListener('click', () => setMode('register'));
    tabLogin.addEventListener('click', () => setMode('login'));
    form.addEventListener('submit', doAuth);
    setMode('register');
  }

  function ensureAuth() {
    if (authState) return Promise.resolve(authState);
    const stored = readStoredAuth();
    if (stored) {
      authState = stored;
      return Promise.resolve(authState);
    }
    if (authPromise) return authPromise;

    authPromise = new Promise((resolve) => {
      createOverlay();
      const timer = setInterval(() => {
        if (!authState) return;
        clearInterval(timer);
        resolve(authState);
      }, 150);
    });

    return authPromise;
  }

  window.MultiPixelAuth = {
    ensureAuth,
    getAuth: () => authState || readStoredAuth(),
    clearAuth: () => {
      authState = null;
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  };
})();
