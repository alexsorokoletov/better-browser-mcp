// Like a password manager's inline menu: an iframe of this extension appears when a field gets focus.
// It honours data-1p-ignore like 1Password does, except on pages with ?stubborn (a manager that ignores it).
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || document.getElementById('fake-pm-menu')) return;
  if (el.hasAttribute('data-1p-ignore') && !location.search.includes('stubborn')) return;
  const f = document.createElement('iframe');
  f.id = 'fake-pm-menu';
  f.src = chrome.runtime.getURL('menu.html');
  f.style.cssText = 'position:absolute;top:0;right:0;width:240px;height:120px;border:1px solid #888';
  document.body.append(f);
});
