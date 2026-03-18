/**
 * Build Discord embed for Pay It Monthly (payitmonthly.uk) webhooks.
 * Event types: Decision, Finance App Status, prefilter_outcome, agreement_status.
 * Also handles alternate payload shapes (different field names, nested objects).
 */
const KNOWN_EVENT_NAMES = ['Decision', 'Finance App Status', 'prefilter_outcome', 'agreement_status'];

function safeStr(val) {
  if (val == null) return '—';
  const s = String(val).trim();
  return s.length > 1024 ? s.slice(0, 1021) + '...' : s;
}

const EVENT_CONFIG = {
  Decision: { title: 'Decision', color: 0x3498db, emoji: '📋' },
  'Finance App Status': { title: 'Finance App Status', color: 0x9b59b6, emoji: '💳' },
  prefilter_outcome: { title: 'Prefilter outcome', color: 0x95a5a6, emoji: '🔍' },
  agreement_status: { title: 'Agreement status', color: 0x2ecc71, emoji: '📄' },
};

/**
 * Infer event label from Pay It Monthly webhook body (many possible shapes).
 */
function detectPayItMonthlyEventType(body) {
  if (!body || typeof body !== 'object') return '';

  for (const name of KNOWN_EVENT_NAMES) {
    if (body[name] != null && typeof body[name] === 'object') return name;
  }

  const keys = [
    'type', 'event', 'webhook_type', 'event_type', 'EventType', 'eventType',
    'action', 'Action', 'trigger', 'Trigger', 'subject', 'Subject',
    'notification_type', 'NotificationType', 'name', 'title',
  ];
  for (const k of keys) {
    const v = body[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (KNOWN_EVENT_NAMES.includes(s)) return s;
    if (s.length > 0 && s.length < 80 && !s.startsWith('{')) return s;
  }

  return '';
}

/**
 * Pick nested payload object (data / payload / first known-event key).
 */
function extractPayItMonthlyData(body) {
  if (!body || typeof body !== 'object') return {};
  let inner = body.data || body.payload;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner;
  for (const name of KNOWN_EVENT_NAMES) {
    if (body[name] && typeof body[name] === 'object') return body[name];
  }
  return body;
}

function buildPayItMonthlyEmbed(eventType, data, fullBody) {
  const body = fullBody && typeof fullBody === 'object' ? fullBody : {};
  const d = data && typeof data === 'object' ? { ...body, ...data } : { ...body };

  const displayType = eventType && eventType !== 'unknown' ? eventType : detectPayItMonthlyEventType(body) || 'Webhook notification';
  const config = EVENT_CONFIG[displayType] || { title: displayType, color: 0x3498db, emoji: '💳' };

  const fields = [{ name: 'Event', value: safeStr(displayType), inline: true }];

  const amount = d.amount || d.total || d.value || d.payment_amount || d.PaymentAmount;
  if (amount != null && String(amount).trim() !== '') {
    const currency = d.currency || d.currency_code || d.Currency || 'GBP';
    const num = Number(amount);
    const display = Number.isNaN(num) ? String(amount) : new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(num);
    fields.push({ name: 'Amount', value: display, inline: true });
  }

  const status = d.status || d.state || d.outcome || d.Status || d.State;
  if (status != null && String(status).trim() !== '') {
    fields.push({ name: 'Status', value: safeStr(status), inline: true });
  }

  const agreementId = d.agreement_id || d.agreementId || d.AgreementId || d.id;
  if (agreementId != null && String(agreementId).trim() !== '') {
    fields.push({ name: 'Agreement ID', value: safeStr(agreementId), inline: true });
  }

  const skip = new Set([
    'amount', 'total', 'value', 'payment_amount', 'PaymentAmount', 'currency', 'currency_code', 'Currency',
    'status', 'state', 'outcome', 'Status', 'State', 'agreement_id', 'agreementId', 'AgreementId', 'id',
    'data', 'payload', 'type', 'event', 'webhook_type', 'event_type',
  ]);
  for (const name of KNOWN_EVENT_NAMES) skip.add(name);

  for (const [key, value] of Object.entries(d)) {
    if (skip.has(key) || value == null || typeof value === 'object') continue;
    const str = safeStr(value);
    if (str !== '—') {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase());
      fields.push({ name: label, value: str, inline: true });
    }
    if (fields.length >= 24) break;
  }

  if (fields.length <= 1 && body && typeof body === 'object') {
    const topKeys = Object.keys(body).filter((k) => !KNOWN_EVENT_NAMES.includes(k));
    if (topKeys.length) {
      fields.push({
        name: 'Received fields',
        value: topKeys.slice(0, 15).join(', ') + (topKeys.length > 15 ? '…' : ''),
        inline: false,
      });
    }
  }

  return {
    title: `${config.emoji} Pay It Monthly: ${config.title}`,
    color: config.color,
    fields,
    footer: { text: 'BSM Bot · Pay It Monthly' },
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  buildPayItMonthlyEmbed,
  detectPayItMonthlyEventType,
  extractPayItMonthlyData,
};
