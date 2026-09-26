// Transactional email through the Brevo REST API (https://developers.brevo.com/reference/sendtransacemail).
// The API key never leaves the server: it is a Firebase secret (BREVO_API_KEY).

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

function config() {
  return {
    senderEmail: process.env.MAIL_SENDER_EMAIL,
    senderName: process.env.MAIL_SENDER_NAME || 'Interim',
    adminEmail: process.env.ADMIN_EMAIL,
    appUrl: process.env.APP_URL || ''
  };
}

// Shared layout: plain table markup and inline styles, which is what mail clients render reliably.
function layout({ title, intro, rows = [], body = '', cta }) {
  const { appUrl } = config();
  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;border:1px solid #e2e7e4">
        ${rows.map(([key, value]) => `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e7e4;background:#f5f7f5;color:#5c6863;font-size:13px;width:38%;vertical-align:top">${esc(key)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e7e4;color:#1b2521;font-size:14px;white-space:pre-line">${esc(value || 'Non renseigné')}</td>
        </tr>`).join('')}
      </table>`
    : '';
  const ctaHtml = cta
    ? `<p style="margin:24px 0 0"><a href="${esc(cta.url || appUrl)}" style="display:inline-block;background:#1f6b52;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;font-size:14px">${esc(cta.label)}</a></p>`
    : '';

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f7f5;font-family:Arial,Helvetica,sans-serif;color:#1b2521">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e7e4">
        <tr><td style="background:#123d30;padding:18px 28px;color:#ffffff;font-size:20px;font-weight:700">Interim</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px;color:#123d30">${esc(title)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.6">${intro}</p>
          ${rowsHtml}
          ${body}
          ${ctaHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e2e7e4;color:#5c6863;font-size:12px;line-height:1.5">
          Cet e-mail est envoyé automatiquement par la plateforme Interim. ${appUrl ? `<a href="${esc(appUrl)}" style="color:#1f6b52">${esc(appUrl.replace(/^https?:\/\//, ''))}</a>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function toText({ title, intro, rows = [] }) {
  const plainIntro = intro.replace(/<[^>]+>/g, '');
  return [title, '', plainIntro, '', ...rows.map(([k, v]) => `${k} : ${v || 'Non renseigné'}`)].join('\n');
}

async function sendMail({ to, toName, subject, content, replyTo, tag }) {
  const { senderEmail, senderName } = config();
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !senderEmail) {
    console.warn('Brevo non configuré (BREVO_API_KEY ou MAIL_SENDER_EMAIL manquant). E-mail ignoré :', subject);
    return;
  }
  if (!to) return;

  const response = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to, ...(toName ? { name: toName } : {}) }],
      ...(replyTo ? { replyTo } : {}),
      subject,
      htmlContent: layout(content),
      textContent: toText(content),
      ...(tag ? { tags: [tag] } : {})
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo ${response.status} : ${detail}`);
  }
}

// Sends the user copy and the admin copy independently: one failing must not cancel the other.
async function sendPair(userMail, adminMail) {
  const { adminEmail } = config();
  const jobs = [];
  if (userMail) jobs.push(sendMail(userMail));
  if (adminMail) {
    if (adminEmail) jobs.push(sendMail({ ...adminMail, to: adminEmail }));
    else console.warn('ADMIN_EMAIL non défini : notification admin ignorée :', adminMail.subject);
  }
  const results = await Promise.allSettled(jobs);
  results.filter((r) => r.status === 'rejected').forEach((r) => console.error(r.reason));
}

module.exports = { config, esc, sendMail, sendPair };
