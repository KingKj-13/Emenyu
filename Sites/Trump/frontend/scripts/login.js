document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const status = document.getElementById('loginStatus');
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next') || '';

  function roleHome(role) {
    return role === 'waiter' ? '/Trump/Waiter' : '/Trump/Admin';
  }

  function safeNext(role, fallbackPath) {
    const candidate = next.startsWith('/Trump') || next.startsWith('/trump') ? next : '';
    if (!candidate) {
      return fallbackPath || roleHome(role);
    }

    if (role === 'waiter' && /\/admin(?:\.html)?$/i.test(candidate)) {
      return roleHome(role);
    }

    return candidate;
  }

  function setStatus(message, type = '') {
    status.textContent = message;
    status.dataset.type = type;
  }

  fetch('/Trump/api/auth/me')
    .then(response => (response.ok ? response.json() : null))
    .then(data => {
      if (data?.user) {
        window.location.replace(safeNext(data.user.role, data.defaultPath));
      }
    })
    .catch(() => {});

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setStatus('Checking access...');

    const payload = {
      username: form.username.value.trim(),
      password: form.password.value
    };

    try {
      const response = await fetch('/Trump/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Invalid username or password.');
      }

      setStatus('Access granted.', 'success');
      window.location.href = safeNext(data.user?.role, data.defaultPath);
    } catch (error) {
      setStatus(error.message || 'Login failed.', 'error');
    }
  });
});
