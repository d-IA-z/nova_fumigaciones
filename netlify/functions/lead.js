/**
 * NOVA FUMIGACIONES — Netlify Function: lead.js
 *
 * Recibe un POST con los datos del formulario y:
 *  1) Crea un registro en Airtable (CRM de leads)
 *  2) Envía email de confirmación al lead (vía Resend) — opcional
 *  3) Envía email interno al equipo de Nova               — opcional
 *
 * Variables de entorno necesarias (configurar en Netlify → Site settings → Environment variables):
 *   AIRTABLE_TOKEN       → Personal Access Token de Airtable (requerido)
 *   AIRTABLE_BASE_ID     → ID de la base (requerido)
 *   AIRTABLE_TABLE       → Nombre o ID de la tabla (requerido — ej: "Leads")
 *
 *   RESEND_API_KEY       → API key de Resend (opcional, para enviar mails)
 *   RESEND_FROM          → Email remitente verificado (ej: "Nova <contacto@novafumigaciones.com.ar>")
 *   NOTIFY_EMAIL         → Email donde llegan las notificaciones internas (ej: novafumigaciones49@gmail.com)
 *   N8N_LEAD_WEBHOOK_URL → URL del Webhook de n8n para el aviso por Telegram (opcional). Si está, se le
 *                          envía el lead al instante (sin que n8n tenga que sondear Airtable).
 *
 * Si AIRTABLE_TOKEN no está configurada, la función devuelve 503 y el frontend
 * cae al fallback de WhatsApp automáticamente.
 */

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'Method not allowed' });
  }

  // Parsear body
  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { message: 'Body inválido (JSON esperado)' });
  }

  // Validación mínima
  const required = ['nombre', 'telefono', 'email', 'servicio'];
  for (const k of required) {
    if (!data[k] || typeof data[k] !== 'string' || !data[k].trim()) {
      return json(400, { message: `Campo requerido faltante: ${k}` });
    }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
    return json(400, { message: 'Email inválido' });
  }
  // Honeypot anti-spam (opcional, si agregamos un input oculto)
  if (data.website) {
    return json(200, { message: 'OK' }); // silent drop
  }

  // Sanitizar (truncar a límites razonables)
  const lead = {
    nombre:   String(data.nombre).slice(0, 120).trim(),
    telefono: String(data.telefono).slice(0, 40).trim(),
    email:    String(data.email).slice(0, 200).trim().toLowerCase(),
    servicio: String(data.servicio).slice(0, 80).trim(),
    zona:     String(data.zona || '').slice(0, 80).trim(),
    mensaje:  String(data.mensaje || '').slice(0, 2000).trim(),
    fecha:    new Date().toISOString(),
    origen:   'Sitio web',
    ip:       (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || null,
    ua:       (event.headers['user-agent'] || '').slice(0, 200) || null
  };

  // ───── 1) Airtable ─────
  const AT_TOKEN = process.env.AIRTABLE_TOKEN;
  const AT_BASE  = process.env.AIRTABLE_BASE_ID;
  const AT_TABLE = process.env.AIRTABLE_TABLE || 'Leads';

  if (!AT_TOKEN || !AT_BASE) {
    // Backend no configurado todavía. El frontend caerá a WhatsApp.
    console.warn('[lead] Airtable no configurada (faltan env vars).');
    return json(503, { message: 'Backend no configurado todavía. Usá WhatsApp por ahora.' });
  }

  try {
    const airtableUrl = `https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent(AT_TABLE)}`;
    const atRes = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          'Nombre':   lead.nombre,
          'Telefono': lead.telefono,
          'Email':    lead.email,
          'Servicio': lead.servicio,
          'Zona':     lead.zona,
          'Mensaje':  lead.mensaje,
          'Fecha':    lead.fecha,
          'Origen':   lead.origen
        },
        typecast: true
      })
    });

    if (!atRes.ok) {
      const errBody = await atRes.text();
      console.error('[lead] Airtable error', atRes.status, errBody);
      return json(502, { message: 'No pudimos registrar tu consulta. Probá por WhatsApp o llamanos al 221 201-9320.' });
    }
  } catch (err) {
    console.error('[lead] Airtable fetch failed', err);
    return json(502, { message: 'No pudimos conectar con el sistema. Probá por WhatsApp.' });
  }

  // ───── 1.5) Aviso instantáneo a n8n → Telegram (sin sondear Airtable) ─────
  // Fire-and-forget pero con await: en serverless hay que esperar la request,
  // y el try/catch evita que un fallo del webhook rompa la respuesta al cliente.
  const N8N_WEBHOOK = process.env.N8N_LEAD_WEBHOOK_URL;
  if (N8N_WEBHOOK) {
    try {
      await fetch(N8N_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead)
      });
    } catch (err) {
      console.warn('[lead] Aviso n8n falló (no crítico):', err.message);
    }
  }

  // ───── 2) Email confirmación al lead (Resend, opcional) ─────
  const RESEND_KEY  = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM;
  const NOTIFY_TO   = process.env.NOTIFY_EMAIL;

  if (RESEND_KEY && RESEND_FROM) {
    // Email al cliente
    sendResend(RESEND_KEY, {
      from: RESEND_FROM,
      to: [lead.email],
      subject: 'Recibimos tu consulta — Nova Fumigaciones',
      html: clientEmailHTML(lead)
    }).catch(e => console.warn('[lead] Email lead falló:', e.message));

    // Email interno al equipo
    if (NOTIFY_TO) {
      sendResend(RESEND_KEY, {
        from: RESEND_FROM,
        to: [NOTIFY_TO],
        subject: `Nuevo lead — ${lead.nombre} (${lead.servicio})`,
        html: internalEmailHTML(lead),
        reply_to: lead.email
      }).catch(e => console.warn('[lead] Email interno falló:', e.message));
    }
  }

  return json(200, {
    message: '¡Gracias! Recibimos tu consulta. Te respondemos a la brevedad.'
  });
};

// ─── helpers ───
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body)
  };
}

async function sendResend(apiKey, payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend ${res.status}: ${txt}`);
  }
  return res.json();
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function clientEmailHTML(lead) {
  return `<!DOCTYPE html>
<html><body style="margin:0;font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden;border:1px solid #e5e5e5;">
    <div style="background:#0a0a0a;color:#fff;padding:24px 28px;">
      <div style="color:#D42B2B;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">Nova Fumigaciones</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;">Recibimos tu consulta</h1>
    </div>
    <div style="padding:28px;color:#222;line-height:1.6;">
      <p>Hola <strong>${esc(lead.nombre)}</strong>,</p>
      <p>Gracias por contactarte con Nova Fumigaciones. Recibimos tu consulta y te respondemos a la brevedad con un presupuesto sin cargo.</p>
      <p style="background:#f8f8f8;padding:16px;border-left:3px solid #D42B2B;border-radius:2px;font-size:14px;">
        <strong>Servicio:</strong> ${esc(lead.servicio)}<br>
        <strong>Zona:</strong> ${esc(lead.zona) || '—'}<br>
        ${lead.mensaje ? `<strong>Tu mensaje:</strong> ${esc(lead.mensaje)}` : ''}
      </p>
      <p>Si necesitás atención inmediata, escribinos por WhatsApp al <a href="https://wa.me/542212019320" style="color:#D42B2B;text-decoration:none;font-weight:700;">+54 221 201-9320</a>.</p>
      <p style="font-style:italic;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">Tu tranquilidad empieza con un ambiente libre de plagas.</p>
    </div>
    <div style="background:#0a0a0a;color:#888;padding:16px 28px;font-size:12px;text-align:center;">
      Nova Fumigaciones · La Plata, Buenos Aires · 221 201-9320
    </div>
  </div>
</body></html>`;
}

function internalEmailHTML(lead) {
  return `<!DOCTYPE html>
<html><body style="margin:0;font-family:Arial,sans-serif;background:#fff;padding:24px;">
  <h2 style="color:#D42B2B;margin:0 0 16px;">Nuevo lead recibido</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:8px;background:#f8f8f8;font-weight:700;">Nombre</td><td style="padding:8px;border-bottom:1px solid #eee;">${esc(lead.nombre)}</td></tr>
    <tr><td style="padding:8px;background:#f8f8f8;font-weight:700;">Teléfono</td><td style="padding:8px;border-bottom:1px solid #eee;"><a href="tel:${esc(lead.telefono)}">${esc(lead.telefono)}</a></td></tr>
    <tr><td style="padding:8px;background:#f8f8f8;font-weight:700;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;"><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></td></tr>
    <tr><td style="padding:8px;background:#f8f8f8;font-weight:700;">Servicio</td><td style="padding:8px;border-bottom:1px solid #eee;">${esc(lead.servicio)}</td></tr>
    <tr><td style="padding:8px;background:#f8f8f8;font-weight:700;">Zona</td><td style="padding:8px;border-bottom:1px solid #eee;">${esc(lead.zona) || '—'}</td></tr>
    <tr><td style="padding:8px;background:#f8f8f8;font-weight:700;vertical-align:top;">Mensaje</td><td style="padding:8px;border-bottom:1px solid #eee;white-space:pre-wrap;">${esc(lead.mensaje) || '—'}</td></tr>
    <tr><td style="padding:8px;background:#f8f8f8;font-weight:700;">Fecha</td><td style="padding:8px;">${esc(lead.fecha)}</td></tr>
  </table>
  <p style="margin-top:16px;font-size:12px;color:#999;">Lead registrado automáticamente en Airtable.</p>
</body></html>`;
}
