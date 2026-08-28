/* ============================================================
   Netlify Function: отправка персональной подборки на e-mail.
   Вызывается из формы «Отправить подборку себе» (assets/app.js).

   Требует переменные окружения (Netlify → Site settings → Environment):
     SMTP_HOST      напр. mail.goldglobe.ru
     SMTP_PORT      465 (SSL) или 587 (STARTTLS); по умолчанию 465
     SMTP_USER      логин, обычно полный адрес (podbor@goldglobe.ru)
     SMTP_PASS      пароль ящика / пароль приложения
     MAIL_FROM      (необяз.) От кого, напр. "Golden Gift <podbor@goldglobe.ru>"
     MAIL_TO_OWNER  (необяз.) скрытая копия заявки вам на почту
   ============================================================ */
const nodemailer = require("nodemailer");

const BRAND = "Golden Gift";
const SITE_URL = "https://goldglobe.ru";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("ru-RU") + " ₽";
}
function isEmail(s) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim());
}

function itemCardHtml(item) {
  const name = esc(item.name || "Украшение");
  const price = esc(money(item.price));
  const photo = esc(item.photo || "");
  const link = esc(item.link || "");
  const img = photo
    ? `<img src="${photo}" width="150" alt="${name}" style="display:block;width:150px;max-width:150px;height:auto;border-radius:8px;background:#f7f6f4;">`
    : `<div style="width:150px;height:150px;background:#f7f6f4;border-radius:8px;"></div>`;
  const btn = link
    ? `<a href="${link}" style="display:inline-block;margin-top:8px;padding:9px 18px;background:#b9894a;color:#ffffff;text-decoration:none;border-radius:4px;font:600 14px/1 Arial,sans-serif;">Посмотреть →</a>`
    : "";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border:1px solid #eadfce;border-radius:10px;">
      <tr>
        <td style="padding:16px;vertical-align:top;width:166px;">${img}</td>
        <td style="padding:16px 16px 16px 0;vertical-align:top;font-family:Arial,sans-serif;">
          <div style="font-size:18px;color:#171513;">${name}</div>
          <div style="font-size:20px;color:#b9894a;font-weight:700;margin:6px 0 4px;">${price}</div>
          ${btn}
        </td>
      </tr>
    </table>`;
}

function buildHtml(name, items) {
  const hello = name ? `Здравствуйте, ${esc(name)}!` : "Здравствуйте!";
  const cards = items.map(itemCardHtml).join("");
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f2ee;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f2ee;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:26px 28px 8px;font-family:Georgia,serif;font-size:22px;letter-spacing:.02em;color:#171513;">${BRAND}</td></tr>
        <tr><td style="padding:0 28px 18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#4a453f;">
          <p style="margin:0 0 6px;">${hello}</p>
          <p style="margin:0;">Вот ваша персональная подборка из трёх украшений, которые лучше всего подходят под ваш запрос.</p>
        </td></tr>
        <tr><td style="padding:0 28px 8px;">${cards}</td></tr>
        <tr><td style="padding:8px 28px 28px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#9a938a;border-top:1px solid #eee;">
          <p style="margin:14px 0 0;">Подборка сформирована сервисом ${BRAND}. <a href="${SITE_URL}" style="color:#b9894a;">${SITE_URL.replace(/^https?:\/\//, "")}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildText(name, items) {
  const hello = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  const lines = items.map(i => {
    const parts = [`• ${i.name || "Украшение"} — ${money(i.price)}`];
    if (i.link) parts.push(`  ${i.link}`);
    return parts.join("\n");
  });
  return `${hello}\n\nВаша персональная подборка:\n\n${lines.join("\n\n")}\n\n${BRAND} — ${SITE_URL}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let data;
  try { data = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "Bad JSON" }) }; }

  const email = String(data.email || "").trim();
  const name = String(data.name || "").trim().slice(0, 80);
  const items = (Array.isArray(data.items) ? data.items : []).slice(0, 3).map(i => ({
    name: String(i && i.name || "").slice(0, 120),
    price: Number(i && i.price) || 0,
    photo: String(i && i.photo || "").slice(0, 600),
    link: String(i && i.link || "").slice(0, 600)
  }));

  if (!isEmail(email)) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "Некорректный e-mail" }) };
  }
  if (!items.length) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: "Пустая подборка" }) };
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_TO_OWNER } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { statusCode: 503, headers: JSON_HEADERS, body: JSON.stringify({ error: "SMTP не настроен" }) };
  }

  const port = Number(SMTP_PORT) || 465;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,           // 465 = SSL, 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  try {
    await transporter.sendMail({
      from: MAIL_FROM || `${BRAND} <${SMTP_USER}>`,
      to: email,
      bcc: MAIL_TO_OWNER || undefined,
      subject: "Ваша персональная подборка украшений — " + BRAND,
      text: buildText(name, items),
      html: buildHtml(name, items)
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: "Не удалось отправить письмо", detail: String((e && e.message) || e) }) };
  }
};
