/**
 * Build Discord embed for Pay It Monthly (payitmonthly.uk) webhooks.
 * Event types: Decision, Finance App Status, prefilter_outcome, agreement_status.
 * Payload shape is unknown; we display type and any amount/status/agreement-like fields.
 */
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

function buildPayItMonthlyEmbed(eventType, data) {
  const config = EVENT_CONFIG[eventType] || { title: eventType, color: 0x3498db, emoji: '💳' };
  const d = data && typeof data === 'object' ? data : {};

  const fields = [{ name: 'Event', value: eventType, inline: true }];

  const amount = d.amount ?? d.total ?? d.value ?? d.payment_amount;
  if (amount != null) {
    const currency = d.currency ?? d.currency_code ?? 'GBP';
    const num = Number(amount);
    const display = Number.isNaN(num) ? String(amount) : new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(num);
    fields.push({ name: 'Amount', value: display, inline: true });
  }

  const status = d.status ?? d.state ?? d.outcome;
  if (status != null) fields.push({ name: 'Status', value: safeStr(status), inline: true });

  const agreementId = d.agreement_id ?? d.agreementId ?? d.id;
  if (agreementId != null) fields.push({ name: 'Agreement ID', value: safeStr(agreementId), inline: true });

  const skip = new Set(['amount', 'total', 'value', 'payment_amount', 'currency', 'currency_code', 'status', 'state', 'outcome', 'agreement_id', 'agreementId', 'id']);
  for (const [key, value] of Object.entries(d)) {
    if (skip.has(key) || value == null || typeof value === 'object') continue;
    const str = safeStr(value);
    if (str !== '—') {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase());
      fields.push({ name: label, value: str, inline: true });
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

module.exports = { buildPayItMonthlyEmbed };
