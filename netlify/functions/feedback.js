// Serverless-функция Netlify: принимает замечание с сайта и шлёт в Telegram.
// Секреты берутся из переменных окружения Netlify (в код не попадают):
//   TG_BOT_TOKEN  — токен бота от @BotFather
//   TG_CHAT_ID    — chat_id получателя (личный или группы)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;
  if (!token || !chatId) {
    return { statusCode: 500, body: 'Не настроены TG_BOT_TOKEN / TG_CHAT_ID' };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Bad JSON' };
  }

  const name = String(data.name || 'без имени').slice(0, 80);
  const section = String(data.section || '—').slice(0, 120);
  const text = String(data.text || '').trim().slice(0, 2000);
  if (!text) return { statusCode: 400, body: 'Пустое замечание' };

  const msg =
    '💬 Замечание с сайта обучения\n\n' +
    '👤 ' + name + '\n' +
    '📄 Раздел: ' + section + '\n\n' +
    text;

  try {
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { statusCode: 502, body: 'Telegram error: ' + t };
    }
  } catch (e) {
    return { statusCode: 502, body: 'Network error: ' + e.message };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
