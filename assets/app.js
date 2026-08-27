/* ============================================================
   app.js — логика квиза GOLDGLOBE, дизайн Golden Gift v17.
   База данных (Supabase) и структура products/matrix/result_texts/
   events/leads — прежние, без изменений. Правьте контакты ниже.
   ============================================================ */

/* ----- Настройки связи (правьте под себя) ----- */
const SITE = {
  brand: "GOLDGLOBE",
  whatsapp: "79000000000",   // номер без + и пробелов, для wa.me. Впишите настоящий номер.
  telegram: "",               // напр. "goldglobe" (без @) — используется, если whatsapp пуст
  phone: "+7 (900) 000-00-00",
  siteUrl: "https://goldglobe.ru",
  collectLead: true
};

/* ----- Данные (Supabase или демо-сид) ----- */
let PRODUCTS = {}, MATRIX = {}, TEXTS = {};
const answers = {};
const sid = getSession();

function getSession() {
  let s = sessionStorage.getItem("gg_sid");
  if (!s) { s = "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); sessionStorage.setItem("gg_sid", s); }
  return s;
}

async function loadData() {
  const seed = window.QUIZ_SEED || { products: {}, matrix: {}, texts: {} };
  if (window.DB && DB.enabled) {
    try {
      const [prods, matrix, texts] = await Promise.all([
        DB.select("products", "select=*&active=eq.true&order=sort"),
        DB.select("matrix", "select=*"),
        DB.select("result_texts", "select=*")
      ]);
      PRODUCTS = {}; prods.forEach(p => PRODUCTS[p.sku] = { sku: p.sku, name: p.name, price: p.price, photo: p.photo, link: p.link });
      MATRIX = {}; matrix.forEach(m => MATRIX[m.key] = { aid: m.aid, skus: [m.sku1, m.sku2, m.sku3] });
      TEXTS = {}; texts.forEach(t => TEXTS[t.key] = { tid: t.tid, title: t.title, subtitle: t.subtitle, argument: t.argument });
      return;
    } catch (e) { console.warn("Supabase недоступен, работаем на демо-данных:", e); }
  }
  PRODUCTS = seed.products || {}; MATRIX = seed.matrix || {}; TEXTS = seed.texts || {};
}

function log(step, extra) {
  if (!window.DB || !DB.enabled) return;
  const row = Object.assign({
    session_id: sid, step,
    occasion: answers.occasion || null, style: answers.style || null,
    budget: answers.budget || null, priority: answers.priority || null
  }, extra || {});
  DB.insert("events", row).catch(() => {});
}

const money = n => (n || 0).toLocaleString("ru-RU") + " ₽";

/* ----- Соответствие подписей вариантов ответа внутренним кодам базы -----
   Тексты слева — это data-value кнопок в разметке (дизайн Golden Gift).
   Коды справа — те же, что в таблицах matrix / result_texts / events. */
const OCCASION_CODE = {
  "Предложение": "proposal",
  "День рождения": "birthday",
  "Годовщина": "anniversary",
  "8 Марта": "march8",
  "День Влюбленных": "valentine",
  "Просто порадовать": "justbecause",
  "Извиниться": "apology"
};
const STYLE_CODE = { "Минимализм": "minimal", "Классика": "classic", "Тренды": "trends", "Не знаю": "unknown" };
const BUDGET_CODE = { "до 15 тыс. ₽": "b1", "15–20 тыс. ₽": "b2", "от 20 тыс. ₽": "b3" };
const PRIORITY_CODE = {
  "Чтобы ей точно понравилось": "like",
  "Чтобы выглядело дорого": "expensive",
  "Чтобы подарок был со смыслом": "meaning",
  "Чтобы выбрать быстро и без сомнений": "fast"
};

/* ----- Навигация по экранам ----- */
const screens = Array.from(document.querySelectorAll(".quiz-screen"));
const totalSteps = 5;
let loadingSequenceTimer = null;
let loadingFinalTimer = null;
const state = { screen: 0 };

function stopLoadingSequence() {
  if (loadingSequenceTimer) { clearInterval(loadingSequenceTimer); loadingSequenceTimer = null; }
  if (loadingFinalTimer) { clearTimeout(loadingFinalTimer); loadingFinalTimer = null; }
}

function showScreen(number) {
  // при любом переходе отменяем автопереход экрана загрузки,
  // чтобы кнопка «Назад» с него реально возвращала на шаг назад
  stopLoadingSequence();
  state.screen = number;
  screens.forEach(screen => {
    screen.classList.toggle("active", Number(screen.dataset.screen) === number);
  });
  updateProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateProgress() {
  document.querySelectorAll(".quiz-screen").forEach(screen => {
    const screenNumber = Number(screen.dataset.screen);
    const fill = screen.querySelector(".progress-fill");
    const dots = screen.querySelector(".dots");
    const step = Math.min(Math.max(screenNumber, 1), totalSteps);
    // Точки расставлены по 0/25/50/75/100 % (totalSteps точек).
    // На каждом шаге заливка доводится ровно до следующей точки, и эта
    // точка (как и все пройденные) подсвечивается — чтобы прогресс всегда
    // упирался в точку, а не останавливался между ними.
    const reachedDot = Math.min(step + 1, totalSteps);
    const percent = screenNumber === 0 ? 0 : ((reachedDot - 1) / (totalSteps - 1)) * 100;
    if (fill) fill.style.width = percent + "%";
    if (dots) {
      dots.innerHTML = "";
      for (let i = 1; i <= totalSteps; i++) {
        const dot = document.createElement("span");
        dot.className = "dot" + (i <= reachedDot ? " active" : "");
        dots.appendChild(dot);
      }
    }
  });
}

function setNextState(question) {
  const group = document.querySelector(`[data-question="${question}"]`);
  if (!group) return;
  const screen = group.closest(".quiz-screen");
  const next = screen ? screen.querySelector("[data-next]") : null;
  const selected = group.querySelector(".option.selected");
  if (next) next.classList.toggle("disabled", !selected);
}

/* ----- Подбор результата (та же логика, что и раньше) ----- */
function matchResult() {
  const tag = answers.occasion === "proposal" ? "proposal" : "gift";
  const mKey = `${tag}|${answers.style}|${answers.budget}`;
  const tKey = `${answers.occasion}|${answers.priority}`;
  const m = MATRIX[mKey] || { aid: "", skus: [] };
  const t = TEXTS[tKey] || {
    tid: "",
    title: "Из сотен украшений мы отобрали три, которые лучше всего соответствуют твоему запросу.",
    subtitle: "", argument: ""
  };
  const items = m.skus.filter(Boolean).map(sku => ({ sku, ...(PRODUCTS[sku] || { name: "Изделие", price: 0, photo: "" }) }));
  return { m, t, items };
}

function makePlaceholder(sku) {
  return `<div class="missing-photo"><strong>${sku}</strong><span>Фото скоро будет</span></div>`;
}

function ctaMessage(skus) {
  const list = skus.map(s => {
    const p = PRODUCTS[s];
    return p ? `${s} ${p.name}` : s;
  }).join(", ");
  return `Здравствуйте! Прошёл квиз на сайте, подобрал: ${list}. Хочу уточнить наличие.`;
}

function ctaLink(skus) {
  const text = ctaMessage(skus);
  if (SITE.whatsapp) return { href: `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text)}` };
  if (SITE.telegram) return { href: `https://t.me/${SITE.telegram}?text=${encodeURIComponent(text)}` };
  return { href: `tel:${SITE.phone.replace(/[^\d+]/g, "")}` };
}

/* ----- Карточка товара (разметка/классы — из дизайна Golden Gift) ----- */
function renderProductCard(item, index, argument, featuredSku) {
  const priceText = money(item.price);
  const imgHtml = item.photo ? `<img src="${item.photo}" alt="${item.name}">` : makePlaceholder(item.sku);
  const isFeatured = item.sku === featuredSku;
  const matchValues = [97, 94, 92];
  const match = matchValues[index] || Math.max(90, 97 - index * 3);
  const badgeHtml = isFeatured ? `<div class="expert-badge"><span class="star" aria-hidden="true">★</span><span>Выбор эксперта</span></div>` : "";
  const argumentHtml = isFeatured && argument ? `<div class="product-argument featured-argument"><span>${argument}</span></div>` : "";
  return `
    <article class="product ${isFeatured ? "featured" : ""}" data-sku="${item.sku}">
      <div class="product-frame">
        ${badgeHtml}
        <div class="product-match"><strong>${match}%</strong><span>совпадение (на основе схожих профилей)</span></div>
        <div class="product-img">${imgHtml}</div>
      </div>
      <div class="product-body">
        <h3>${item.name}</h3>
        <strong>${priceText}</strong>
        ${argumentHtml}
        <a class="buy-btn" href="#" data-sku="${item.sku}">Выбрать <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      </div>
    </article>
  `;
}

/* ----- Анимация экрана «загрузки» ----- */
function getLoadingProducts() {
  const { items } = matchResult();
  const selectedSkus = items.map(i => i.sku);
  const pool = Object.values(PRODUCTS)
    .filter(p => p && p.photo && !selectedSkus.includes(p.sku))
    .slice(0, 12)
    .map(p => ({ sku: p.sku }));
  return [...items, ...pool].slice(0, 15);
}

function prepareLoadingVisual() {
  const orbit = document.getElementById("jewelryOrbit");
  const stage = document.getElementById("jewelryFilterStage");
  if (!orbit || !stage) return;
  stage.classList.remove("is-final");
  const items = getLoadingProducts();
  const positions = [
    [12, 28], [27, 15], [46, 12], [66, 16], [85, 30],
    [91, 55], [80, 77], [61, 86], [39, 86], [19, 76],
    [8, 55], [28, 48], [50, 49], [72, 49], [50, 72]
  ];
  orbit.innerHTML = items.map((item, index) => {
    const product = PRODUCTS[item.sku] || {};
    const pos = positions[index] || [50, 50];
    const keep = index < 3 ? " keep" : "";
    const finalClass = index < 3 ? ` final-${index + 1}` : "";
    const img = product.photo
      ? `<img src="${product.photo}" alt="${product.name || "Украшение"}">`
      : `<span>${item.sku || ""}</span>`;
    return `<div class="loading-jewel${keep}${finalClass}" data-index="${index}" style="--x:${pos[0]}%;--y:${pos[1]}%">${img}</div>`;
  }).join("");
}

function startLoadingSequence() {
  stopLoadingSequence();
  prepareLoadingVisual();

  const steps = [
    { title: "Учитываем повод подарка", count: "1 / 4", progress: 18, visible: 15 },
    { title: "Сопоставляем стиль", count: "2 / 4", progress: 44, visible: 10 },
    { title: "Определяем главную рекомендацию", count: "3 / 4", progress: 72, visible: 6 },
    { title: "Формируем персональную подборку", count: "4 / 4", progress: 100, visible: 3 }
  ];

  let index = 0;
  const title = document.getElementById("loadingStageTitle");
  const count = document.getElementById("loadingStageCount");
  const fill = document.getElementById("loadingBarFill");
  const stage = document.getElementById("jewelryFilterStage");

  function applyStep(stepIndex) {
    const step = steps[stepIndex];
    if (title) title.textContent = step.title;
    if (count) count.textContent = step.count;
    if (fill) fill.style.width = step.progress + "%";
    document.querySelectorAll("#jewelryOrbit .loading-jewel").forEach((node, itemIndex) => {
      if (itemIndex >= step.visible && itemIndex >= 3) node.classList.add("removed");
    });
    if (step.visible === 3 && stage) stage.classList.add("is-final");
  }

  applyStep(0);
  loadingSequenceTimer = setInterval(() => {
    index += 1;
    if (index < steps.length) {
      applyStep(index);
    } else {
      clearInterval(loadingSequenceTimer);
      loadingSequenceTimer = null;
      loadingFinalTimer = setTimeout(() => showScreen(7), 700);
    }
  }, 1150);
}

/* ----- Экран результата ----- */
function renderResult() {
  const { t, items } = matchResult();
  log("result", { skus: items.map(i => i.sku) });

  const titleEl = document.getElementById("resultTitle");
  if (titleEl) titleEl.textContent = t.title || "Из сотен украшений мы отобрали три, которые лучше всего соответствуют твоему запросу.";

  const summaryEl = document.getElementById("summary");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="summary-item"><span>Повод</span><strong>${answers.occasionLabel || ""}</strong></div>
      <div class="summary-item"><span>Стиль</span><strong>${answers.styleLabel || ""}</strong></div>
      <div class="summary-item"><span>Бюджет</span><strong>${answers.budgetLabel || ""}</strong></div>
      <div class="summary-item"><span>Приоритет</span><strong>${answers.priorityLabel || ""}</strong></div>
    `;
  }

  const grid = document.getElementById("recommendedProducts");
  const repeatGrid = document.getElementById("recommendedProductsRepeat");

  if (!items.length) {
    const msg = '<div class="no-match">Не удалось подобрать украшения для этой комбинации ответов — мы уже знаем об этом. Напишите нам, поможем вручную.</div>';
    if (grid) grid.innerHTML = msg;
    if (repeatGrid) repeatGrid.innerHTML = msg;
    return;
  }

  const featuredSku = items[0].sku;
  const cardsHtml = items.map((item, index) => renderProductCard(item, index, t.argument || "", featuredSku)).join("");
  if (grid) grid.innerHTML = cardsHtml;
  if (repeatGrid) repeatGrid.innerHTML = cardsHtml;

  document.querySelectorAll(".buy-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const sku = btn.dataset.sku;
      const link = (PRODUCTS[sku] || {}).link;
      if (link) {
        log("cta", { skus: [sku], meta: { type: "link", source: "product" } });
        window.open(link, "_blank", "noopener");
        return;
      }
      const cta = ctaLink([sku]);
      log("cta", { skus: [sku], meta: { type: "messenger", source: "product" } });
      window.open(cta.href, "_blank", "noopener");
    });
  });
}

/* ----- Обработчики интерфейса ----- */
const startBtn = document.getElementById("startBtn");
if (startBtn) startBtn.addEventListener("click", () => { log("start"); showScreen(1); });

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => showScreen(0));
});

document.querySelectorAll("[data-back]").forEach(button => {
  button.addEventListener("click", () => {
    if (state.screen > 0) showScreen(state.screen - 1);
  });
});

document.querySelectorAll(".option").forEach(option => {
  option.addEventListener("click", () => {
    const group = option.closest("[data-question]");
    const question = group.dataset.question;
    group.querySelectorAll(".option").forEach(item => item.classList.remove("selected"));
    option.classList.add("selected");

    const label = option.dataset.value;
    if (question === "occasion") { answers.occasion = OCCASION_CODE[label] || label; answers.occasionLabel = label; }
    if (question === "style") { answers.style = STYLE_CODE[label] || label; answers.styleLabel = label; }
    if (question === "budget") { answers.budget = BUDGET_CODE[label] || label; answers.budgetLabel = label; }
    if (question === "priority") { answers.priority = PRIORITY_CODE[label] || label; answers.priorityLabel = label; }

    log(question, {});
    setNextState(question);
  });
});

document.querySelectorAll("[data-next]").forEach(button => {
  button.addEventListener("click", () => {
    if (button.classList.contains("disabled")) return;
    if (state.screen === 4) {
      renderResult();
      prepareLoadingVisual();
      showScreen(5);
      return;
    }
    showScreen(state.screen + 1);
  });
});

const analysisBtn = document.getElementById("analysisContinueBtn");
if (analysisBtn) analysisBtn.addEventListener("click", () => {
  showScreen(6);
  requestAnimationFrame(() => startLoadingSequence());
});

const allReviewsBtn = document.getElementById("allReviewsBtn");
if (allReviewsBtn) allReviewsBtn.addEventListener("click", () => {
  alert("Раздел со всеми отзывами скоро появится.");
});

/* ----- «Консультация эксперта» ----- */
const expertConsultationBtn = document.getElementById("expertConsultationBtn");
if (expertConsultationBtn) {
  expertConsultationBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const { items } = matchResult();
    const cta = ctaLink(items.map(i => i.sku));
    log("cta", { skus: items.map(i => i.sku), meta: { type: "messenger", source: "consultation" } });
    window.open(cta.href, "_blank", "noopener");
  });
}

/* ----- «Отправить подборку себе» (модалка с формой Имя + Email) ----- */
const selectionModal = document.getElementById("selectionModal");
if (selectionModal) {
  const selectionForm = document.getElementById("selectionForm");
  const selectionModalContent = document.getElementById("selectionModalContent");
  const selectionSuccess = document.getElementById("selectionSuccess");

  // Модалка должна лежать вне анимированных/обрезанных .quiz-screen (overflow:hidden),
  // иначе position:fixed «прибивается» к экрану квиза вместо всего окна.
  if (selectionModal.parentElement !== document.body) document.body.appendChild(selectionModal);

  function openSelectionModal() {
    selectionModal.classList.add("is-open");
    selectionModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("selection-modal-open");
    selectionModalContent.hidden = false;
    selectionSuccess.hidden = true;
    selectionForm.reset();
    selectionForm.querySelectorAll("label").forEach(label => label.classList.remove("has-error"));
    selectionForm.querySelectorAll(".field-error").forEach(error => { error.textContent = ""; });
    requestAnimationFrame(() => selectionForm.elements.name.focus());
  }

  function closeSelectionModal() {
    selectionModal.classList.remove("is-open");
    selectionModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("selection-modal-open");
  }

  document.addEventListener("click", event => {
    if (!event.target.closest("#selectionShareTrigger")) return;
    event.preventDefault();
    openSelectionModal();
  });
  selectionModal.querySelectorAll("[data-selection-close]").forEach(button => {
    button.addEventListener("click", closeSelectionModal);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && selectionModal.classList.contains("is-open")) closeSelectionModal();
  });

  selectionForm.addEventListener("submit", async event => {
    event.preventDefault();
    const nameField = selectionForm.elements.name;
    const emailField = selectionForm.elements.email;
    [nameField, emailField].forEach(field => {
      field.closest("label").classList.remove("has-error");
      field.closest("label").querySelector(".field-error").textContent = "";
    });

    let firstInvalid = null;
    if (!nameField.value.trim()) {
      nameField.closest("label").classList.add("has-error");
      nameField.closest("label").querySelector(".field-error").textContent = "Пожалуйста, укажи имя.";
      firstInvalid = nameField;
    }
    if (!emailField.value.trim() || !emailField.validity.valid) {
      emailField.closest("label").classList.add("has-error");
      emailField.closest("label").querySelector(".field-error").textContent = "Проверь адрес электронной почты.";
      firstInvalid = firstInvalid || emailField;
    }
    if (firstInvalid) { firstInvalid.focus(); return; }

    const { items } = matchResult();
    const name = nameField.value.trim();
    const email = emailField.value.trim();
    log("cta", { skus: items.map(i => i.sku), meta: { type: "selection_email", source: "selection_modal" } });
    if (window.DB && DB.enabled) {
      try {
        // Заглушка: подборка сохраняется как лид, письмо с ней пока не отправляется —
        // рассылку писем нужно подключить отдельно (сервис e-mail-рассылок).
        await DB.insert("leads", {
          session_id: sid, name, phone: "", contact: email,
          occasion: answers.occasion, style: answers.style, budget: answers.budget, priority: answers.priority,
          skus: items.map(i => i.sku)
        });
      } catch (e) { console.warn(e); }
    }
    selectionModalContent.hidden = true;
    selectionSuccess.hidden = false;
  });
}

/* ----- Инфо-страница из подвала (О нас / Доставка / FAQ / Гарантия / Политика ПД) ----- */
const quizApp = document.querySelector(".app");
const infoPage = document.getElementById("infoPage");
if (quizApp && infoPage) {
  let infoReturnScroll = 0;

  function openInfoPage(targetId) {
    infoReturnScroll = window.scrollY;
    quizApp.hidden = true;
    infoPage.hidden = false;
    document.body.classList.add("info-page-open");
    requestAnimationFrame(() => {
      const target = document.getElementById(targetId) || infoPage;
      target.scrollIntoView({ behavior: "auto", block: "start" });
      history.replaceState(null, "", "#" + (target.id || "info-about"));
    });
  }

  function closeInfoPage() {
    infoPage.hidden = true;
    quizApp.hidden = false;
    document.body.classList.remove("info-page-open");
    history.replaceState(null, "", location.pathname + location.search);
    requestAnimationFrame(() => window.scrollTo({ top: infoReturnScroll, behavior: "auto" }));
  }

  document.addEventListener("click", event => {
    const infoTrigger = event.target.closest("[data-info-target]");
    if (infoTrigger) {
      event.preventDefault();
      openInfoPage(infoTrigger.dataset.infoTarget);
      return;
    }
    const closeTrigger = event.target.closest("[data-info-close]");
    if (closeTrigger) {
      event.preventDefault();
      closeInfoPage();
    }
  });

  document.querySelectorAll(".faq-question").forEach(button => {
    button.addEventListener("click", () => {
      const wasOpen = button.getAttribute("aria-expanded") === "true";
      document.querySelectorAll(".faq-question").forEach(otherButton => {
        otherButton.setAttribute("aria-expanded", "false");
        document.getElementById(otherButton.getAttribute("aria-controls")).hidden = true;
      });
      if (!wasOpen) {
        button.setAttribute("aria-expanded", "true");
        document.getElementById(button.getAttribute("aria-controls")).hidden = false;
      }
    });
  });

  const initialInfoTarget = location.hash.slice(1);
  if (["info-about", "info-quality", "info-delivery", "info-faq"].includes(initialInfoTarget)) {
    openInfoPage(initialInfoTarget);
  }
}

/* ----- Старт ----- */
(async function () {
  await loadData();
  updateProgress();
})();
