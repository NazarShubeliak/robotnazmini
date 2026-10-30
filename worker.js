// Робот на зміні — приймає заявки з форми сайту і пересилає їх у Telegram.
// Розгортається як Cloudflare Worker (безкоштовний тариф). Налаштування — у ІНСТРУКЦІЯ.md.
//
// Змінні середовища (Settings → Variables and Secrets):
//   TELEGRAM_BOT_TOKEN  — токен бота від @BotFather (тип Secret)
//   TELEGRAM_CHAT_ID    — id чату або групи, куди слати заявки
//   ALLOWED_ORIGIN      — адреса сайту, напр. https://robotnazmini.com.ua
//                         (кілька — через кому; "*" — дозволити всім, лише для тесту)

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, cors);

    // Відсікаємо запити з чужих сайтів
    if (!cors['Access-Control-Allow-Origin']) return json({ ok: false, error: 'forbidden_origin' }, 403, cors);

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: 'bad_json' }, 400, cors);
    }

    // Пастка для спам-ботів: справжні люди це поле не заповнюють
    if (data && data.website) return json({ ok: true }, 200, cors);

    const clean = (v, max) => String(v ?? '').trim().slice(0, max);
    const name = clean(data.name, 100);
    const contact = clean(data.contact, 100);
    const business = clean(data.business, 150);
    const task = clean(data.task, 2000);
    const page = clean(data.page, 300);

    if (!name || !contact) return json({ ok: false, error: 'required_fields' }, 400, cors);

    const when = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
    const text =
      `🤖 <b>Нова заявка з сайту</b>\n\n` +
      `<b>Ім’я:</b> ${esc(name)}\n` +
      `<b>Контакт:</b> ${esc(contact)}\n` +
      `<b>Сфера:</b> ${esc(business) || '—'}\n` +
      `<b>Задача:</b>\n${esc(task) || '—'}\n\n` +
      `<i>${esc(when)}${page ? ' · ' + esc(page) : ''}</i>`;

    const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!tg.ok) {
      console.log('Telegram error', tg.status, await tg.text());
      return json({ ok: false, error: 'telegram_failed' }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  },
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (allowed.includes('*')) headers['Access-Control-Allow-Origin'] = '*';
  else if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
