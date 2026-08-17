/* ============================================================
   db.js — тонкая обёртка над Supabase (PostgREST + Auth).
   Без внешних зависимостей: только fetch.
   Если config.js пуст — db.enabled === false, работаем на демо-данных.
   ============================================================ */
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const enabled = !!(cfg.url && cfg.anonKey);
  const base = (cfg.url || "").replace(/\/$/, "");
  const anon = cfg.anonKey || "";

  function token() {
    return sessionStorage.getItem("gg_admin_token") || anon;
  }
  function headers(extra) {
    return Object.assign({
      "apikey": anon,
      "Authorization": "Bearer " + token(),
      "Content-Type": "application/json"
    }, extra || {});
  }

  const db = {
    enabled,
    // ---- чтение справочников ----
    async select(table, query) {
      const q = query ? "?" + query : "?select=*";
      const r = await fetch(`${base}/rest/v1/${table}${q}`, { headers: headers() });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    // ---- вставка (события, заявки) ----
    async insert(table, row) {
      const r = await fetch(`${base}/rest/v1/${table}`, {
        method: "POST",
        headers: headers({ "Prefer": "return=minimal" }),
        body: JSON.stringify(row)
      });
      if (!r.ok) throw new Error(await r.text());
      return true;
    },
    // ---- обновление (админ: каталог, матрица, тексты) ----
    async update(table, matchQuery, patch) {
      const r = await fetch(`${base}/rest/v1/${table}?${matchQuery}`, {
        method: "PATCH",
        headers: headers({ "Prefer": "return=minimal" }),
        body: JSON.stringify(patch)
      });
      if (!r.ok) throw new Error(await r.text());
      return true;
    },
    // ---- авторизация администратора ----
    async login(email, password) {
      const r = await fetch(`${base}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "apikey": anon, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json();
      if (!r.ok || !data.access_token) throw new Error(data.error_description || data.msg || "Не удалось войти");
      sessionStorage.setItem("gg_admin_token", data.access_token);
      return data;
    },
    logout() { sessionStorage.removeItem("gg_admin_token"); },
    isAdmin() { return !!sessionStorage.getItem("gg_admin_token"); }
  };

  window.DB = db;
})();
