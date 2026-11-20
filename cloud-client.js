(() => {
  'use strict';
  const root = new URL('.', document.currentScript.src);
  const storageKey = 'invariant-account-session-v1';
  let endpoint;

  function session() {
    try { return JSON.parse(sessionStorage.getItem(storageKey)); }
    catch { return null; }
  }

  function logout() {
    try { sessionStorage.removeItem(storageKey); } catch {}
  }

  async function service() {
    endpoint ||= fetch(new URL('accounts-api.json', root), { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error();
        const { url } = await response.json();
        if (!url) return null;
        const address = new URL(url, root);
        if (address.protocol !== 'https:' && address.origin !== root.origin) throw new Error();
        return new URL(address.href.replace(/\/+$/, '') + '/');
      })
      .catch(() => {
        endpoint = undefined;
        throw new Error('Не удалось загрузить настройки кабинета.');
      });
    return endpoint;
  }

  async function request(path, { method = 'GET', data, key = session()?.key } = {}) {
    const base = await service();
    if (!base) throw new Error('Облачный кабинет ещё настраивается.');
    if (!key) throw new Error('Войди в учебный кабинет.');
    const headers = { Authorization: `Bearer ${key}` };
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(new URL(path, base), {
      method, headers, body: data === undefined ? undefined : JSON.stringify(data),
      credentials: 'omit', cache: 'no-store', redirect: 'error',
    }).catch(() => { throw new Error('Нет связи с облачным кабинетом. Попробуй ещё раз.'); });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      if (response.status === 401 && session()?.key === key) logout();
      const error = new Error(result?.error || 'Облачный кабинет временно недоступен.');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function login(key) {
    const user = await request('session', { key });
    sessionStorage.setItem(storageKey, JSON.stringify({ ...user, key }));
    return user;
  }

  window.OgeCloud = { session, service, request, login, logout };
})();
