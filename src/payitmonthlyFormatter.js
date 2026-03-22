/**
 * Build Discord embed for Pay It Monthly (payitmonthly.uk) webhooks.
 * Flattens nested JSON so details show even when data is under data/payload/customData.
 */
const KNOWN_EVENT_NAMES = ['Decision', 'Finance App Status', 'prefilter_outcome', 'agreement_status'];

function safeStr(val) {
  if (val == null) return '—';
  const s = String(val).trim();
  return s.length > 1024 ? s.slice(0, 1021) + '...' : s;
}

function formatFieldLabel(path) {
  return path
    .replace(/\./g, ' · ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Flatten nested objects into dot-path keys (max depth) for Discord fields.
 */
function flattenPayload(obj, depth = 0, maxDepth = 4, prefix = '', out = new Map()) {
  if (obj == null || depth > maxDepth) return out;
  if (typeof obj !== 'object') {
    out.set(prefix || 'value', safeStr(obj));
    return out;
  }
  if (Array.isArray(obj)) {
    const s = JSON.stringify(obj);
    out.set(prefix || 'items', s.length > 900 ? s.slice(0, 897) + '...' : s);
    return out;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return out;

  for (const k of keys) {
    const v = obj[k];
    const path = prefix ? `${prefix}.${k}` : k;
    if (v == null) continue;

    if (typeof v === 'object' && !Array.isArray(v)) {
      const nestedKeys = Object.keys(v);
      if (nestedKeys.length === 0) continue;
      flattenPayload(v, depth + 1, maxDepth, path, out);
    } else if (Array.isArray(v)) {
      const s = JSON.stringify(v);
      out.set(path, s.length > 900 ? s.slice(0, 897) + '...' : s);
    } else {
      const str = safeStr(v);
      if (str !== '—') out.set(path, str);
    }
  }

  return out;
}

const EVENT_CONFIG = {
  Decision: { title: 'Decision', color: 0x3498db, emoji: '📋' },
  'Finance App Status': { title: 'Finance App Status', color: 0x9b59b6, emoji: '💳' },
  prefilter_outcome: { title: 'Prefilter outcome', color: 0x95a5a6, emoji: '🔍' },
  agreement_status: { title: 'Agreement status', color: 0x2ecc71, emoji: '📄' },
};

function detectPayItMonthlyEventType(body) {
  if (!body || typeof body !== 'object') return '';

  for (const name of KNOWN_EVENT_NAMES) {
    if (body[name] != null && typeof body[name] === 'object') return name;
  }

  const keys = [
    'type', 'event', 'webhook_type', 'event_type', 'EventType', 'eventType',
    'action', 'Action', 'trigger', 'Trigger', 'subject', 'Subject',
    'notification_type', 'NotificationType', 'name', 'title', 'Status', 'status',
  ];
  for (const k of keys) {
    const v = body[k];
    if (v == null || typeof v === 'object') continue;
    const s = String(v).trim();
    if (!s) continue;
    if (KNOWN_EVENT_NAMES.includes(s)) return s;
    if (s.length > 0 && s.length < 80 && !s.startsWith('{') && !s.startsWith('http')) return s;
  }

  return '';
}

function extractPayItMonthlyData(body) {
  if (!body || typeof body !== 'object') return {};
  let inner = body.data || body.payload || body.body || body.result;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner;
  for (const name of KNOWN_EVENT_NAMES) {
    if (body[name] && typeof body[name] === 'object') return body[name];
  }
  return body;
}

/** Merge all likely payload roots so nothing is missed. */
function mergePayItMonthlyRoots(body) {
  if (!body || typeof body !== 'object') return {};
  const merged = { ...body };
  const nests = [body.data, body.payload, body.body, body.result, body.customData, body.custom_data];
  for (const n of nests) {
    if (n && typeof n === 'object' && !Array.isArray(n)) {
      Object.assign(merged, n);
    }
  }
  for (const name of KNOWN_EVENT_NAMES) {
    if (body[name] && typeof body[name] === 'object') {
      Object.assign(merged, body[name]);
    }
  }
  return merged;
}

function shouldSkipFlattenKey(key) {
  const lower = key.toLowerCase();
  if (lower === 'signature' || lower.endsWith('.signature')) return true;
  return false;
}

function buildPayItMonthlyEmbed(eventType, data, fullBody) {
  const body = fullBody && typeof fullBody === 'object' ? fullBody : {};
  const merged = mergePayItMonthlyRoots(body);

  const detected = detectPayItMonthlyEventType(body);
  const displayType =
    (eventType && eventType !== 'unknown' ? eventType : null) ||
    detected ||
    (merged.type && String(merged.type)) ||
    (merged.event && String(merged.event)) ||
    'Pay It Monthly';

  const config = EVENT_CONFIG[displayType] || { title: displayType, color: 0x3498db, emoji: '💳' };

  const flat = flattenPayload(merged, 0, 4, '', new Map());

  const skipExact = new Set([
    'type', 'event', 'webhook_type', 'event_type', 'data', 'payload', 'body', 'result',
    'customData', 'custom_data',
  ]);

  const fields = [{ name: 'Event', value: safeStr(displayType), inline: false }];

  const added = new Set(['event']);
  let count = 1;

  const preferredOrder = [
    'amount', 'total', 'value', 'payment_amount', 'PaymentAmount',
    'status', 'state', 'outcome', 'Status', 'State',
    'email', 'customer_email', 'customerEmail',
    'customer_name', 'name', 'firstName', 'lastName', 'client_name',
    'agreement_id', 'agreementId', 'AgreementId', 'id',
    'currency', 'currency_code',
  ];

  function addField(path, value) {
    if (count >= 25 || added.has(path)) return;
    if (shouldSkipFlattenKey(path)) return;
    const label = formatFieldLabel(path);
    fields.push({ name: label.slice(0, 256), value: value, inline: value.length < 40 });
    added.add(path);
    count++;
  }

  for (const pref of preferredOrder) {
    for (const [path, val] of flat.entries()) {
      if (path === pref || path.endsWith(`.${pref}`)) {
        addField(path, val);
      }
    }
  }

  for (const [path, val] of flat.entries()) {
    const rootKey = path.split('.')[0];
    if (skipExact.has(rootKey) && !path.includes('.')) continue;
    if (KNOWN_EVENT_NAMES.includes(rootKey)) continue;
    addField(path, val);
  }

  let description = '';
  if (fields.length <= 1) {
    let preview;
    try {
      preview = JSON.stringify(body, null, 2);
    } catch {
      preview = String(body);
    }
    description =
      preview.length > 3800 ? preview.slice(0, 3797) + '…' : preview;
  }

  return {
    title: `${config.emoji} Pay It Monthly: ${config.title}`,
    color: config.color,
    description: description || undefined,
    fields,
    footer: { text: 'BSM Bot · Pay It Monthly' },
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  buildPayItMonthlyEmbed,
  detectPayItMonthlyEventType,
  extractPayItMonthlyData,
  mergePayItMonthlyRoots,
};
