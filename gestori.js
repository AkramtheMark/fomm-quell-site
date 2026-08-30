(() => {
  const loginTab = document.getElementById('tab-login-btn');
  const registerTab = document.getElementById('tab-register-btn');
  const loginPanel = document.getElementById('panel-login');
  const registerPanel = document.getElementById('panel-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginMessage = document.getElementById('login-message');
  const registerMessage = document.getElementById('register-message');

  const showMessage = (element, message, type = 'error') => {
    element.textContent = message;
    element.className = `auth-msg ${type}-msg`;
    element.hidden = false;
  };

  const clearMessages = () => {
    loginMessage.hidden = true;
    registerMessage.hidden = true;
  };

  const setActivePanel = panel => {
    const showLogin = panel === 'login';
    loginTab.classList.toggle('active', showLogin);
    registerTab.classList.toggle('active', !showLogin);
    loginTab.setAttribute('aria-selected', String(showLogin));
    registerTab.setAttribute('aria-selected', String(!showLogin));
    loginPanel.hidden = !showLogin;
    registerPanel.hidden = showLogin;
    clearMessages();
  };

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Risposta non valida dal server. Riprova più tardi.');
    }
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || 'Operazione non riuscita.');
    }
    return payload;
  };

  const redirectByRole = user => {
    window.location.replace(user.ruolo === 'admin' ? 'admin.html' : 'realta.html');
  };

  loginTab.addEventListener('click', () => setActivePanel('login'));
  registerTab.addEventListener('click', () => setActivePanel('register'));

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    clearMessages();
    const submitButton = loginForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      const result = await request('backend/api/auth.php?action=login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('login-email').value.trim(),
          password: document.getElementById('login-password').value
        })
      });
      redirectByRole(result.user);
    } catch (error) {
      showMessage(loginMessage, error.message);
      submitButton.disabled = false;
    }
  });

  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    clearMessages();
    const submitButton = registerForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      const result = await request('backend/api/register_venue.php', {
        method: 'POST',
        body: JSON.stringify({
          nome_locale: document.getElementById('register-venue-name').value.trim(),
          email: document.getElementById('register-email').value.trim(),
          password: document.getElementById('register-password').value
        })
      });
      registerForm.reset();
      showMessage(registerMessage, result.message || 'Richiesta inviata con successo.', 'success');
    } catch (error) {
      showMessage(registerMessage, error.message);
    } finally {
      submitButton.disabled = false;
    }
  });

  request('backend/api/auth.php?action=check')
    .then(result => {
      if (result.logged_in && result.user) redirectByRole(result.user);
    })
    .catch(() => {});
})();
