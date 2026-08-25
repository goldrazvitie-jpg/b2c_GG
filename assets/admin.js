/* ============================================================
   admin.js — админ-панель GOLDGLOBE
   ============================================================ */
const L = {
  tag: { proposal: "Предложение", gift: "Подарок" },
  style: { minimal: "Минимализм", classic: "Классика", trends: "Тренды", unknown: "Не знаю" },
  budget: { b1: "10–15 тыс. ₽", b2: "15–20 тыс. ₽", b3: "от 20 тыс. ₽" },
  occasion: { proposal: "Предложение", birthday: "День рождения", anniversary: "Годовщина", march8: "8 Марта", valentine: "День влюблённых", justbecause: "Просто порадовать", apology: "Извиниться" },
  priority: { like: "Ей понравится", expensive: "Выглядит дорого", meaning: "Со смыслом", fast: "Быстрый выбор" }
};
const money = n => (Number(n) || 0).toLocaleString("ru-RU") + " ₽";
const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
const root = document.getElementById("root");

let STATE = { products: [], matrix: [], texts: [], events: [], leads: [], tab: "products", dirty: {}, period: "all" };

/* ---------------- проверка конфигурации ---------------- */
if (!window.DB || !DB.enabled) {
  root.innerHTML = `<div class="login"><div class="box">
    <h1>Админка не подключена</h1>
    <p>Заполните <code>assets/config.js</code> (URL и anon-ключ Supabase) и выполните <code>supabase_schema.sql</code>. Пока база не подключена, статистика не собирается и вход недоступен.</p>
    <a class="btn" href="index.html">← К квизу</a></div></div>`;
} else if (!DB.isAdmin()) {
  renderLogin();
} else {
  boot();
}

/* ---------------- вход ---------------- */
function renderLogin() {
  root.innerHTML = "";
  const box = el(`<div class="login"><div class="box">
    <h1>GOLDGLOBE</h1><p>Панель управления квизом</p>
    <input id="email" type="email" placeholder="E-mail" autocomplete="username">
    <input id="pass" type="password" placeholder="Пароль" autocomplete="current-password">
    <div class="err" id="err"></div>
    <button class="btn" id="go" style="width:100%">Войти</button>
  </div></div>`);
  root.appendChild(box);
  const go = box.querySelector("#go");
  const submit = async () => {
    const email = box.querySelector("#email").value.trim();
    const pass = box.querySelector("#pass").value;
    box.querySelector("#err").textContent = "";
    go.disabled = true; go.textContent = "Входим…";
    try { await DB.login(email, pass); boot(); }
    catch (e) { box.querySelector("#err").textContent = "Неверный e-mail или пароль."; go.disabled = false; go.textContent = "Войти"; }
  };
  go.onclick = submit;
  box.querySelector("#pass").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
}

/* ---------------- загрузка данных ---------------- */
async function boot() {
  root.innerHTML = `<div class="login"><div class="box"><h1>Загрузка…</h1></div></div>`;
  try {
    const [products, matrix, texts, events, leads] = await Promise.all([
      DB.select("products", "select=*&order=sort"),
      DB.select("matrix", "select=*&order=tag,style,budget"),
      DB.select("result_texts", "select=*&order=occasion,priority"),
      DB.select("events", "select=session_id,step,occasion,style,budget,priority,skus,matched_aid,created_at&order=created_at.desc&limit=8000"),
      DB.select("leads", "select=*&order=created_at.desc&limit=500")
    ]);
    STATE.products = products; STATE.matrix = matrix; STATE.texts = texts;
    STATE.events = events; STATE.leads = leads;
    renderShell();
  } catch (e) {
    if (String(e).includes("401") || String(e).toLowerCase().includes("jwt")) { DB.logout(); renderLogin(); return; }
    root.innerHTML = `<div class="login"><div class="box"><h1>Ошибка</h1><p>${e}</p><button class="btn" onclick="location.reload()">Обновить</button></div></div>`;
  }
}

/* ---------------- каркас ---------------- */
function renderShell() {
  const productMap = {}; STATE.products.forEach(p => productMap[p.sku] = p);
  STATE.productMap = productMap;
  root.innerHTML = "";
  root.appendChild(el(`<div class="top">
    <div class="logo">GOLDGLOBE <span>· управление квизом</span></div>
    <div style="display:flex;gap:8px">
      <a class="btn ghost sm" href="index.html" target="_blank">Открыть квиз ↗</a>
      <button class="btn ghost sm" id="logout">Выйти</button>
    </div>
  </div>`));
  const tabs = el(`<div class="tabs">
    <button class="tab" data-t="products">Товары и цены</button>
    <button class="tab" data-t="matrix">Выдача изделий</button>
    <button class="tab" data-t="texts">Тексты</button>
    <button class="tab" data-t="stats">Статистика</button>
  </div>`);
  root.appendChild(tabs);
  const panel = el(`<div class="panel" id="panel"></div>`);
  root.appendChild(panel);
  root.querySelector("#logout").onclick = () => { DB.logout(); renderLogin(); };
  tabs.querySelectorAll(".tab").forEach(b => b.onclick = () => { STATE.tab = b.dataset.t; paint(); });
  paint();
}

function paint() {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.t === STATE.tab));
  const p = document.getElementById("panel");
  STATE.dirty = {};
  if (STATE.tab === "products") p.innerHTML = "", p.appendChild(renderProducts());
  if (STATE.tab === "matrix") p.innerHTML = "", p.appendChild(renderMatrix());
  if (STATE.tab === "texts") p.innerHTML = "", p.appendChild(renderTexts());
  if (STATE.tab === "stats") p.innerHTML = "", p.appendChild(renderStats());
}

function markDirty(id) { STATE.dirty[id] = true; }

/* ---------------- ТОВАРЫ ---------------- */
function renderProducts() {
  const box = el(`<div>
    <h2>Товары и цены</h2>
    <p class="hint">Название, цена, ссылка на фото и ссылка на товар каждого изделия. Эти данные подставляются в результат квиза. Меняете цену здесь — она меняется во всех подборках. Если заполнить «Ссылку на товар», кнопка «Выбрать» в квизе будет вести на неё вместо WhatsApp.</p>
    <div class="bar"><input class="search" id="psearch" placeholder="Поиск по артикулу или названию">
      <span class="grow"></span><span class="saved" id="psaved">Сохранено ✓</span>
      <button class="btn" id="psave">Сохранить изменения</button></div>
  </div>`);
  const table = el(`<table class="tbl"><thead><tr>
    <th style="width:70px">Артикул</th><th style="width:56px">Фото</th><th>Название</th>
    <th style="width:150px">Цена</th><th style="width:280px">Ссылка на фото</th><th style="width:280px">Ссылка на товар</th><th style="width:80px">Показ</th>
  </tr></thead><tbody></tbody></table>`);
  const tb = table.querySelector("tbody");
  STATE.products.forEach(p => {
    const tr = el(`<tr data-sku="${p.sku}">
      <td class="sku">${p.sku}</td>
      <td><img class="thumb" src="${p.photo || ""}" onerror="this.style.visibility='hidden'"></td>
      <td><input value="${escAttr(p.name)}" data-f="name"></td>
      <td><input class="price" type="number" value="${p.price}" data-f="price"></td>
      <td><input value="${escAttr(p.photo || "")}" data-f="photo" placeholder="https://…/photo.jpg"></td>
      <td><input value="${escAttr(p.link || "")}" data-f="link" placeholder="https://goldglobe.ru/product/…"></td>
      <td><input type="checkbox" data-f="active" ${p.active ? "checked" : ""}></td>
    </tr>`);
    tr.querySelectorAll("input").forEach(inp => inp.addEventListener("input", () => {
      markDirty(p.sku); tr.querySelector("td:nth-child(3)").classList.add("dirty");
      if (inp.dataset.f === "photo") tr.querySelector(".thumb").src = inp.value;
    }));
    tb.appendChild(tr);
  });
  box.appendChild(table);
  box.querySelector("#psearch").oninput = e => {
    const q = e.target.value.toLowerCase();
    tb.querySelectorAll("tr").forEach(tr => {
      const sku = tr.dataset.sku.toLowerCase();
      const nm = tr.querySelector('[data-f="name"]').value.toLowerCase();
      tr.style.display = (sku.includes(q) || nm.includes(q)) ? "" : "none";
    });
  };
  box.querySelector("#psave").onclick = async (e) => {
    const btn = e.target; btn.disabled = true; btn.textContent = "Сохраняем…";
    try {
      for (const sku of Object.keys(STATE.dirty)) {
        const tr = tb.querySelector(`tr[data-sku="${sku}"]`);
        const patch = {
          name: tr.querySelector('[data-f="name"]').value,
          price: parseInt(tr.querySelector('[data-f="price"]').value) || 0,
          photo: tr.querySelector('[data-f="photo"]').value,
          link: tr.querySelector('[data-f="link"]').value,
          active: tr.querySelector('[data-f="active"]').checked
        };
        await DB.update("products", `sku=eq.${encodeURIComponent(sku)}`, patch);
        Object.assign(STATE.products.find(p => p.sku === sku), patch);
      }
      flash("psaved"); tb.querySelectorAll(".dirty").forEach(t => t.classList.remove("dirty")); STATE.dirty = {};
    } catch (err) { alert("Не удалось сохранить: " + err); }
    btn.disabled = false; btn.textContent = "Сохранить изменения";
  };
  return box;
}

/* ---------------- ВЫДАЧА (матрица) ---------------- */
function renderMatrix() {
  const opts = STATE.products.map(p => `<option value="${p.sku}">${p.sku} — ${escAttr(p.name)} · ${money(p.price)}</option>`).join("");
  const box = el(`<div>
    <h2>Выдача изделий</h2>
    <p class="hint">24 сценария подбора: по сочетанию «повод-тег × стиль × бюджет» квиз возвращает три изделия. Первое из трёх помечается как «Рекомендуем». Меняйте изделия в выпадающих списках.</p>
    <div class="bar"><span class="grow"></span><span class="saved" id="msaved">Сохранено ✓</span>
      <button class="btn" id="msave">Сохранить изменения</button></div>
  </div>`);
  const table = el(`<table class="tbl"><thead><tr>
    <th style="width:230px">Сценарий</th><th>Изделие 1 · рекомендуемое</th><th>Изделие 2</th><th>Изделие 3</th>
  </tr></thead><tbody></tbody></table>`);
  const tb = table.querySelector("tbody");
  STATE.matrix.forEach(m => {
    const tr = el(`<tr data-key="${m.key}">
      <td><div class="scenario"><b>${L.tag[m.tag]} · ${L.style[m.style]}</b>${L.budget[m.budget]} <span class="pill">${m.aid}</span></div></td>
      <td><select data-f="sku1">${opts}</select></td>
      <td><select data-f="sku2">${opts}</select></td>
      <td><select data-f="sku3">${opts}</select></td>
    </tr>`);
    tr.querySelector('[data-f="sku1"]').value = m.sku1 || "";
    tr.querySelector('[data-f="sku2"]').value = m.sku2 || "";
    tr.querySelector('[data-f="sku3"]').value = m.sku3 || "";
    tr.querySelectorAll("select").forEach(s => s.addEventListener("change", () => { markDirty(m.key); s.closest("td").classList.add("dirty"); }));
    tb.appendChild(tr);
  });
  box.appendChild(table);
  box.querySelector("#msave").onclick = async (e) => {
    const btn = e.target; btn.disabled = true; btn.textContent = "Сохраняем…";
    try {
      for (const key of Object.keys(STATE.dirty)) {
        const tr = tb.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
        const patch = { sku1: tr.querySelector('[data-f="sku1"]').value, sku2: tr.querySelector('[data-f="sku2"]').value, sku3: tr.querySelector('[data-f="sku3"]').value };
        await DB.update("matrix", `key=eq.${encodeURIComponent(key)}`, patch);
        Object.assign(STATE.matrix.find(x => x.key === key), patch);
      }
      flash("msaved"); tb.querySelectorAll(".dirty").forEach(t => t.classList.remove("dirty")); STATE.dirty = {};
    } catch (err) { alert("Не удалось сохранить: " + err); }
    btn.disabled = false; btn.textContent = "Сохранить изменения";
  };
  return box;
}

/* ---------------- ТЕКСТЫ ---------------- */
function renderTexts() {
  const box = el(`<div>
    <h2>Тексты результата</h2>
    <p class="hint">28 вариантов по сочетанию «повод × приоритет». Заголовок, подзаголовок и аргумент для рекомендуемого изделия на экране результата.</p>
    <div class="bar"><span class="grow"></span><span class="saved" id="tsaved">Сохранено ✓</span>
      <button class="btn" id="tsave">Сохранить изменения</button></div>
  </div>`);
  const table = el(`<table class="tbl"><thead><tr>
    <th style="width:180px">Сценарий</th><th>Подзаголовок</th><th>Аргумент для рекомендуемого</th>
  </tr></thead><tbody></tbody></table>`);
  const tb = table.querySelector("tbody");
  STATE.texts.forEach(t => {
    const tr = el(`<tr data-key="${t.key}">
      <td><div class="scenario"><b>${L.occasion[t.occasion]}</b>${L.priority[t.priority]} <span class="pill">${t.tid}</span></div></td>
      <td><textarea data-f="subtitle" rows="2" style="width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:7px 9px;font-family:inherit;font-size:13px">${escHtml(t.subtitle)}</textarea></td>
      <td><textarea data-f="argument" rows="2" style="width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:7px 9px;font-family:inherit;font-size:13px">${escHtml(t.argument)}</textarea></td>
    </tr>`);
    tr.querySelectorAll("textarea").forEach(a => a.addEventListener("input", () => { markDirty(t.key); a.closest("td").classList.add("dirty"); }));
    tb.appendChild(tr);
  });
  box.appendChild(table);
  box.querySelector("#tsave").onclick = async (e) => {
    const btn = e.target; btn.disabled = true; btn.textContent = "Сохраняем…";
    try {
      for (const key of Object.keys(STATE.dirty)) {
        const tr = tb.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
        const patch = { subtitle: tr.querySelector('[data-f="subtitle"]').value, argument: tr.querySelector('[data-f="argument"]').value };
        await DB.update("result_texts", `key=eq.${encodeURIComponent(key)}`, patch);
        Object.assign(STATE.texts.find(x => x.key === key), patch);
      }
      flash("tsaved"); tb.querySelectorAll(".dirty").forEach(t => t.classList.remove("dirty")); STATE.dirty = {};
    } catch (err) { alert("Не удалось сохранить: " + err); }
    btn.disabled = false; btn.textContent = "Сохранить изменения";
  };
  return box;
}

/* ---------------- СТАТИСТИКА ---------------- */
function renderStats() {
  const box = el(`<div>
    <h2>Статистика</h2>
    <p class="hint">Воронка прохождения, популярные ответы и последние результаты. Обновляется при перезагрузке страницы.</p>
    <div class="bar"><div class="period">
      <button data-p="all" class="${STATE.period==='all'?'on':''}">Всё время</button>
      <button data-p="7" class="${STATE.period==='7'?'on':''}">7 дней</button>
      <button data-p="1" class="${STATE.period==='1'?'on':''}">Сегодня</button>
    </div></div>
    <div id="statsbody"></div>
  </div>`);
  box.querySelectorAll(".period button").forEach(b => b.onclick = () => { STATE.period = b.dataset.p; paint(); });
  box.querySelector("#statsbody").appendChild(buildStats());
  return box;
}

function withinPeriod(ts) {
  if (STATE.period === "all") return true;
  const days = STATE.period === "7" ? 7 : 1;
  return (Date.now() - new Date(ts).getTime()) <= days * 864e5;
}

function buildStats() {
  const evs = STATE.events.filter(e => withinPeriod(e.created_at));
  // группировка по сессии
  const sessions = {};
  evs.forEach(e => {
    const s = sessions[e.session_id] || (sessions[e.session_id] = { steps: new Set(), first: e.created_at });
    s.steps.add(e.step);
    if (e.step === "result") { s.result = e; }
    if (e.occasion) s.occasion = e.occasion;
    if (e.style) s.style = e.style;
    if (e.budget) s.budget = e.budget;
    if (e.priority) s.priority = e.priority;
  });
  const all = Object.values(sessions);
  const has = st => all.filter(s => s.steps.has(st)).length;

  const started = has("start") || all.length;
  const done = has("result");
  const cta = has("cta");
  const conv = started ? Math.round(done / started * 100) : 0;
  const ctaConv = done ? Math.round(cta / done * 100) : 0;
  const leadsN = STATE.leads.filter(l => withinPeriod(l.created_at)).length;

  const wrap = el(`<div></div>`);
  wrap.appendChild(el(`<div class="grid">
    <div class="kpi"><div class="n">${started}</div><div class="l">Начали квиз</div></div>
    <div class="kpi"><div class="n">${done}</div><div class="l">Дошли до результата</div><div class="sub">${conv}% доходимость</div></div>
    <div class="kpi"><div class="n">${cta}</div><div class="l">Нажали связаться</div><div class="sub">${ctaConv}% от результатов</div></div>
    <div class="kpi"><div class="n">${leadsN}</div><div class="l">Оставили заявку</div></div>
  </div>`));

  // воронка
  const funnelSteps = [["start", "Открыли / начали"], ["occasion", "Ответили: повод"], ["style", "Ответили: стиль"], ["budget", "Ответили: бюджет"], ["priority", "Ответили: приоритет"], ["result", "Увидели подборку"], ["cta", "Связались"]];
  const base = started || 1;
  let fh = `<div class="funnel"><h3>Воронка</h3>`;
  funnelSteps.forEach(([st, lbl]) => {
    const c = st === "start" ? started : has(st);
    const pct = Math.round(c / base * 100);
    fh += `<div class="frow"><div class="lbl">${lbl}</div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      <div class="val"><b>${c}</b> · ${pct}%</div></div>`;
  });
  fh += `</div>`;
  wrap.appendChild(el(fh));

  // распределения по завершившим (есть result)
  const completed = all.filter(s => s.steps.has("result"));
  wrap.appendChild(el(`<div class="two">
    ${distBlock("Повод", "occasion", completed, L.occasion)}
    ${distBlock("Стиль", "style", completed, L.style)}
    ${distBlock("Бюджет", "budget", completed, L.budget)}
    ${distBlock("Приоритет", "priority", completed, L.priority)}
  </div>`));

  // топ изделий по результатам
  const skuCount = {};
  evs.filter(e => e.step === "result" && Array.isArray(e.skus)).forEach(e => e.skus.forEach(sk => skuCount[sk] = (skuCount[sk] || 0) + 1));
  const topSku = Object.entries(skuCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topSku.length) {
    const maxv = topSku[0][1];
    let th = `<div class="dist" style="margin-bottom:22px"><h3>Чаще всего показывались изделия</h3>`;
    topSku.forEach(([sk, c]) => {
      const p = STATE.productMap[sk];
      th += `<div class="drow"><div class="dl">${sk} · ${p ? escHtml(p.name) : ""}</div>
        <div class="dt"><div class="df" style="width:${Math.round(c / maxv * 100)}%"></div></div><div class="dv">${c}</div></div>`;
    });
    wrap.appendChild(el(th + `</div>`));
  }

  // заявки
  wrap.appendChild(renderLeads());
  return wrap;
}

function distBlock(title, field, sessions, labels) {
  const count = {};
  sessions.forEach(s => { if (s[field]) count[s[field]] = (count[s[field]] || 0) + 1; });
  const rows = Object.entries(count).sort((a, b) => b[1] - a[1]);
  const total = sessions.length || 1;
  const max = rows.length ? rows[0][1] : 1;
  let h = `<div class="dist"><h3>${title}</h3>`;
  if (!rows.length) h += `<div class="empty">Нет данных</div>`;
  rows.forEach(([k, c]) => {
    h += `<div class="drow"><div class="dl">${labels[k] || k}</div>
      <div class="dt"><div class="df" style="width:${Math.round(c / max * 100)}%"></div></div>
      <div class="dv">${Math.round(c / total * 100)}%</div></div>`;
  });
  return h + `</div>`;
}

function renderLeads() {
  const leads = STATE.leads.filter(l => withinPeriod(l.created_at));
  const box = el(`<div class="log"><h3 style="padding:12px 12px 0">Последние заявки</h3></div>`);
  if (!leads.length) { box.appendChild(el(`<div class="empty">Пока нет заявок за выбранный период</div>`)); return box; }
  const table = el(`<table class="tbl" style="border:none"><thead><tr>
    <th>Дата</th><th>Имя</th><th>Контакт</th><th>Ответы</th><th>Изделия</th>
  </tr></thead><tbody></tbody></table>`);
  const tb = table.querySelector("tbody");
  leads.forEach(l => {
    const d = new Date(l.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const ans = [L.occasion[l.occasion], L.style[l.style], L.budget[l.budget]].filter(Boolean).map(x => `<span class="pill">${x}</span>`).join(" ");
    const skus = (l.skus || []).map(s => `<span class="pill">${s}</span>`).join(" ");
    tb.appendChild(el(`<tr><td>${d}</td><td>${escHtml(l.name || "—")}</td>
      <td><b>${escHtml(l.phone || l.contact || "—")}</b></td><td>${ans}</td><td>${skus}</td></tr>`));
  });
  box.appendChild(table);
  return box;
}

/* ---------------- утилиты ---------------- */
function flash(id) { const e = document.getElementById(id); if (!e) return; e.classList.add("show"); setTimeout(() => e.classList.remove("show"), 1800); }
function escAttr(s) { return String(s == null ? "" : s).replace(/"/g, "&quot;"); }
function escHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
