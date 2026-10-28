// Tiny client helper used by every task page.
(function () {
  const api = (path, body, origin) =>
    fetch((origin || '') + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  function toast(msg, kind) {
    let el = document.getElementById('bench-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bench-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast show ' + (kind || '');
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.className = 'toast'), 4000);
  }

  window.bench = {
    submit: (task, data, origin) => api('/api/submit', { task, data }, origin),
    event: (task, type, data, origin) => api('/api/event', { task, type, data }, origin),
    toast,
  };
})();
