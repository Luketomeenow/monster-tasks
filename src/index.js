const express = require('express');
const { FORMS, POLL_INTERVAL_MS } = require('./config');
const { getRowCount, getNewRows, appendRows } = require('./sheets');
const { sendEmbed } = require('./discord');
const { buildEmbed } = require('./formatters');
const { parsePayload, buildLeadFromParsed } = require('./typeform');
const { buildNewLeadEmbed } = require('./typeformFormatter');
const { buildGhlBookedCallEmbed, buildGhlWorkflowEmbed, buildGhlOpportunityEmbed } = require('./ghlFormatter');
const { buildWhopPaymentEmbed } = require('./whopFormatter');
const { buildPayItMonthlyEmbed } = require('./payitmonthlyFormatter');
const state = require('./state');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const WHOP_PAYMENT_EVENTS = [
  'payment.succeeded', 'payment.failed', 'refund.created', 'dispute.created',
  'invoice_paid', 'invoice_created', 'invoice_past_due', 'invoice_voided',
  'membership_activated', 'membership_deactivated',
];
const WHOP_FAILED_EVENTS = ['payment.failed', 'dispute.created', 'invoice_past_due', 'invoice_voided', 'membership_deactivated'];
const WHOP_SUCCESS_REVENUE_EVENTS = ['payment.succeeded', 'invoice_paid', 'membership_activated'];

const REVENUE_SHEET_ID = (process.env.REVENUE_SHEET_ID || '').trim();
const REVENUE_SHEET_NAME = process.env.REVENUE_SHEET_NAME || 'Revenue';

/** Build one Revenue row: [DUE DATE, CLIENT NAME, EMAIL ADDRESS, OFFER, CASH COLLECTED, CONTRACTED, INSTALMENT, STATUS, PAYMENT METHOD, PLATFORM] */
function buildRevenueRow({ date, clientName, email, cashCollected, platform }) {
  const dueDate = date ? (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}/) ? date.slice(0, 10) : new Date(date).toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10);
  return [dueDate, clientName || '', email || '', '', cashCollected ?? '', '', '', '', '', platform || ''];
}

function logPaymentToRevenue(row) {
  if (!REVENUE_SHEET_ID) return Promise.resolve();
  return appendRows(REVENUE_SHEET_ID, REVENUE_SHEET_NAME, [row])
    .then(() => console.log('[Revenue] Row appended to', REVENUE_SHEET_NAME))
    .catch((err) => console.error('[Revenue] Append failed:', err.message));
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), forms: FORMS.length });
});

app.post('/whop/webhook', (req, res) => {
  const webhookUrl = (process.env.DISCORD_WEBHOOK_PAYMENTS || process.env.DISCORD_WEBHOOK_NEW_PAYMENTS || '').trim();
  const failedWebhookUrl = (process.env.DISCORD_WEBHOOK_FAILED_PAYMENTS || '').trim();

  if (!webhookUrl && !failedWebhookUrl) {
    console.error('[WHOP] No payment webhook configured');
    res.status(200).json({ success: false, error: 'Set DISCORD_WEBHOOK_PAYMENTS (and optionally DISCORD_WEBHOOK_FAILED_PAYMENTS) in Railway' });
    return;
  }

  const body = req.body || {};
  let eventType = body.type || body.event;
  let data = body.data ?? body.payload ?? body;

  if (!eventType && data && data.object) {
    eventType = data.object;
    data = data;
  }
  if (!eventType) {
    console.error('[WHOP] Missing event type in payload');
    res.status(200).json({ success: false, error: 'Missing type' });
    return;
  }

  const isFailed = WHOP_FAILED_EVENTS.includes(eventType);
  const targetUrl = isFailed && failedWebhookUrl ? failedWebhookUrl : webhookUrl;
  if (!targetUrl) {
    res.status(200).json({ success: false, error: isFailed ? 'DISCORD_WEBHOOK_FAILED_PAYMENTS not set' : 'DISCORD_WEBHOOK_PAYMENTS not set' });
    return;
  }

  if (!WHOP_PAYMENT_EVENTS.includes(eventType)) {
    console.log('[WHOP] Ignoring event:', eventType);
    res.status(200).json({ success: true, message: 'Ignored' });
    return;
  }

  const embed = buildWhopPaymentEmbed(eventType, data);
  sendEmbed(targetUrl, embed)
    .then(() => {
      console.log('[WHOP] Sent to Discord:', eventType);
      res.status(200).json({ success: true });
      if (REVENUE_SHEET_ID && WHOP_SUCCESS_REVENUE_EVENTS.includes(eventType)) {
        const user = data.user || data.member || data.customer || {};
        const parts = [user.first_name, user.last_name].filter(Boolean);
        const fullName = parts.join(' ').trim();
        const clientName = user.username || user.name || fullName || user.email || '';
        const email = user.email || data.email || '';
        let cash = data.amount ?? data.total ?? data.value;
        if (cash != null) {
          const num = Number(cash);
          cash = Number.isNaN(num) ? cash : (num >= 1000 || num <= -1000 ? num / 100 : num);
        }
        const date = data.paid_at ?? data.created_at ?? data.completed_at;
        logPaymentToRevenue(buildRevenueRow({ date, clientName, email, cashCollected: cash, platform: 'Whop' })).catch(() => {});
      }
    })
    .catch((err) => {
      console.error('[WHOP] Discord failed:', err.message);
      res.status(200).json({ success: false, error: err.message });
    });
});

const PAYITMONTHLY_EVENTS = ['Decision', 'Finance App Status', 'prefilter_outcome', 'agreement_status'];

app.post('/payitmonthly/webhook', (req, res) => {
  const webhookUrl = (process.env.DISCORD_WEBHOOK_PAYMENTS || process.env.DISCORD_WEBHOOK_NEW_PAYMENTS || '').trim();
  if (!webhookUrl) {
    console.error('[PayItMonthly] DISCORD_WEBHOOK_PAYMENTS not set');
    res.status(200).json({ success: false, error: 'Payment webhook not configured' });
    return;
  }

  const body = req.body || {};
  const eventType = body.type ?? body.event ?? body.webhook_type ?? body.event_type ?? '';
  const data = body.data ?? body.payload ?? body;

  console.log('[PayItMonthly] Event:', eventType, '| Keys:', Object.keys(body));

  const normalizedType = PAYITMONTHLY_EVENTS.includes(eventType) ? eventType : (eventType || 'unknown');
  const embed = buildPayItMonthlyEmbed(normalizedType, typeof data === 'object' ? data : body);
  const payItMonthlyData = typeof data === 'object' ? data : body;

  sendEmbed(webhookUrl, embed)
    .then(() => {
      console.log('[PayItMonthly] Sent to Discord:', normalizedType);
      res.status(200).json({ success: true });
      if (REVENUE_SHEET_ID && payItMonthlyData) {
        const amount = payItMonthlyData.amount ?? payItMonthlyData.total ?? payItMonthlyData.value ?? payItMonthlyData.payment_amount;
        if (amount != null && Number(amount) > 0) {
          const clientName = payItMonthlyData.customer_name ?? payItMonthlyData.name ?? payItMonthlyData.client_name ?? payItMonthlyData.customerName ?? '';
          const email = payItMonthlyData.email ?? payItMonthlyData.customer_email ?? payItMonthlyData.customerEmail ?? '';
          const date = payItMonthlyData.date ?? payItMonthlyData.created_at ?? payItMonthlyData.paid_at;
          const cashCollected = Number(amount);
          logPaymentToRevenue(buildRevenueRow({ date, clientName, email, cashCollected: Number.isNaN(cashCollected) ? amount : cashCollected, platform: 'Pay It Monthly' })).catch(() => {});
        }
      }
    })
    .catch((err) => {
      console.error('[PayItMonthly] Discord failed:', err.message);
      res.status(200).json({ success: false, error: err.message });
    });
});

app.post('/typeform/webhook', (req, res) => {
  const rawUrl = process.env.DISCORD_WEBHOOK_NEW_LEAD;
  const webhookUrl = rawUrl ? rawUrl.trim() : '';
  if (!webhookUrl) {
    console.error('[Typeform] DISCORD_WEBHOOK_NEW_LEAD not set');
    res.status(500).json({ error: 'New lead webhook not configured', detail: 'Set DISCORD_WEBHOOK_NEW_LEAD in Railway Variables' });
    return;
  }

  let parsed;
  let lead;
  let embed;
  try {
    parsed = parsePayload(req.body);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid Typeform webhook payload' });
      return;
    }
    lead = buildLeadFromParsed(parsed);
    embed = buildNewLeadEmbed(lead);
  } catch (err) {
    console.error('[Typeform] Parse/format error:', err.message);
    res.status(500).json({ error: 'Error processing payload', detail: err.message });
    return;
  }

  sendEmbed(webhookUrl, embed)
    .then(() => {
      console.log(`[Typeform] New lead sent to Discord (${lead.qualified ? 'QUALIFIED' : 'Unqualified'})`);
      res.status(200).send();
    })
    .catch((err) => {
      console.error('[Typeform] Discord webhook failed:', err.message);
      res.status(500).json({
        error: 'Failed to send to Discord',
        detail: err.message,
      });
    });
});

app.post('/ghl/webhook', (req, res) => {
  const webhookUrl = (process.env.DISCORD_WEBHOOK_BOOKED_CALL || '').trim();
  if (!webhookUrl) {
    console.error('[GHL] DISCORD_WEBHOOK_BOOKED_CALL not set');
    res.status(200).json({ success: false, error: 'Call-booked webhook not configured' });
    return;
  }

  const body = req.body || {};
  console.log('[GHL] Received payload keys:', Object.keys(body));
  console.log('[GHL] Payload:', JSON.stringify(body).slice(0, 500));
  console.log('[GHL] Sending to webhook URL ending in:', '...' + webhookUrl.slice(-20));

  let embed;
  if (body.type === 'AppointmentCreate' && body.appointment) {
    embed = buildGhlBookedCallEmbed(body.appointment);
  } else {
    embed = buildGhlWorkflowEmbed(body);
  }

  console.log('[GHL] Embed title:', embed.title, '| fields:', embed.fields.length);

  sendEmbed(webhookUrl, embed)
    .then(() => {
      console.log('[GHL] Call booked sent to Discord successfully');
      res.status(200).json({ success: true });
    })
    .catch((err) => {
      console.error('[GHL] Discord webhook failed:', err.message);
      res.status(200).json({ success: false, error: err.message });
    });
});

const OPPORTUNITY_WEBHOOKS = {
  no_show: 'DISCORD_WEBHOOK_NO_SHOW',
  follow_up: 'DISCORD_WEBHOOK_FOLLOW_UP',
  closed_deal: 'DISCORD_WEBHOOK_CLOSED_DEAL',
};

function normalizePipelineStage(value) {
  if (value == null || value === '') return null;
  const v = String(value).toLowerCase().replace(/[\s-]/g, '_');
  if (v.includes('no_show') || v.includes('noshow') || v === 'no_show') return 'no_show';
  if (v.includes('follow') || v.includes('followup') || v === 'follow_up') return 'follow_up';
  if (v.includes('closed') || v.includes('deal') || v === 'closed_deal') return 'closed_deal';
  return null;
}

/** Extract stage from GHL webhook body (multiple possible shapes). Prefer workflow Custom Data over trigger payload (e.g. status: "open"). */
function getStageFromBody(body) {
  const candidates = [
    body.customData?.stage,
    body.custom_data?.stage,
    body.stage,
    body.stageName,
    body.stage_name,
    body.pipelineStage,
    body.pipeline_stage,
    body.newStage,
    body.new_stage,
    body.opportunity?.stage,
    body.opportunity?.stageName,
    body.data?.stage,
    body.data?.stageName,
    body.trigger?.stage,
    body.trigger?.stageName,
    body.opportunity?.status,
    body.status,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim();
  }
  return '';
}

app.post('/ghl/opportunity', (req, res) => {
  const body = req.body || {};
  const stageRaw = getStageFromBody(body);
  const stageKey = normalizePipelineStage(stageRaw);

  console.log('[GHL Opportunity] Payload keys:', Object.keys(body));
  console.log('[GHL Opportunity] Stage raw:', stageRaw, '-> normalized:', stageKey);
  if (!stageKey) {
    console.log('[GHL Opportunity] Full body (sample):', JSON.stringify(body).slice(0, 800));
  }

  if (!stageKey || !OPPORTUNITY_WEBHOOKS[stageKey]) {
    console.error('[GHL Opportunity] Unknown or missing stage. Received stageRaw:', stageRaw);
    res.status(200).json({
      success: false,
      error: 'Unknown or missing stage. Send stage in body (e.g. stage: "No show")',
      received: stageRaw || '(empty)',
    });
    return;
  }

  const webhookUrl = (process.env[OPPORTUNITY_WEBHOOKS[stageKey]] || '').trim();
  if (!webhookUrl) {
    console.error('[GHL Opportunity]', OPPORTUNITY_WEBHOOKS[stageKey], 'not set');
    res.status(200).json({ success: false, error: `Webhook not configured for ${stageKey}` });
    return;
  }

  const embed = buildGhlOpportunityEmbed(stageKey, body);
  sendEmbed(webhookUrl, embed)
    .then(() => {
      console.log('[GHL Opportunity] Sent to Discord:', stageKey);
      res.status(200).json({ success: true });
    })
    .catch((err) => {
      console.error('[GHL Opportunity] Discord failed:', err.message);
      res.status(200).json({ success: false, error: err.message });
    });
});

app.get('/ghl/opportunity/test', (req, res) => {
  const stageParam = (req.query.stage || '').trim();
  const stageKey = normalizePipelineStage(stageParam);

  if (!stageKey || !OPPORTUNITY_WEBHOOKS[stageKey]) {
    res.json({
      error: 'Missing or invalid stage',
      usage: 'Add ?stage=no_show or ?stage=follow_up or ?stage=closed_deal to the URL',
    });
    return;
  }

  const webhookUrl = (process.env[OPPORTUNITY_WEBHOOKS[stageKey]] || '').trim();
  if (!webhookUrl) {
    res.json({ error: OPPORTUNITY_WEBHOOKS[stageKey] + ' not set in Railway Variables' });
    return;
  }

  const testBody = {
    firstName: 'Test',
    lastName: 'Contact',
    email: 'test@example.com',
    phone: '—',
  };
  const embed = buildGhlOpportunityEmbed(stageKey, testBody);
  embed.title = '🧪 Test – ' + embed.title;

  sendEmbed(webhookUrl, embed)
    .then(() => {
      res.json({ success: true, message: `Test sent to ${stageKey} channel` });
    })
    .catch((err) => {
      res.json({ success: false, error: err.message });
    });
});

app.get('/ghl/test', (_req, res) => {
  const webhookUrl = (process.env.DISCORD_WEBHOOK_BOOKED_CALL || '').trim();
  if (!webhookUrl) {
    res.json({ error: 'DISCORD_WEBHOOK_BOOKED_CALL not set' });
    return;
  }

  const testEmbed = {
    title: '📅 Test - Call booked (GHL)',
    color: 0x1abc9c,
    description: 'This is a test message to verify the webhook is working.',
    fields: [
      { name: 'Name', value: 'Test Contact', inline: true },
      { name: 'Email', value: 'test@example.com', inline: true },
    ],
    footer: { text: 'BSM Bot · Test' },
    timestamp: new Date().toISOString(),
  };

  sendEmbed(webhookUrl, testEmbed)
    .then(() => {
      res.json({ success: true, message: 'Test message sent to Discord' });
    })
    .catch((err) => {
      res.json({ success: false, error: err.message });
    });
});

async function initState(savedState) {
  console.log('Initialising row counts for each form...');
  const activeForms = FORMS.filter((f) => f.sheetId && f.webhookUrl);

  for (const form of activeForms) {
    if (savedState[form.id]) {
      console.log(`  ${form.name}: resuming from row ${savedState[form.id]}`);
      continue;
    }
    try {
      const count = await getRowCount(form.sheetId);
      state.setLastRow(savedState, form.id, count);
      console.log(`  ${form.name}: ${count} existing rows (will skip these)`);
    } catch (err) {
      console.error(`  ${form.name}: failed to read sheet — ${err.message}`);
    }
  }
}

async function pollForm(form, savedState) {
  const lastRow = state.getLastRow(savedState, form.id);
  const { headers, newRows, totalRows } = await getNewRows(form.sheetId, lastRow);

  if (newRows.length === 0) return 0;

  console.log(`[${form.name}] ${newRows.length} new submission(s)`);

  let sent = 0;
  for (const row of newRows) {
    try {
      const embed = buildEmbed(form, headers, row);
      await sendEmbed(form.webhookUrl, embed);
      sent++;
      // Small delay between messages to respect Discord rate limits
      if (newRows.length > 1) await sleep(1000);
    } catch (err) {
      console.error(`[${form.name}] Failed to send to Discord: ${err.message}`);
    }
  }

  state.setLastRow(savedState, form.id, totalRows);
  return sent;
}

async function pollAll(savedState) {
  const activeForms = FORMS.filter((f) => f.sheetId && f.webhookUrl);

  for (const form of activeForms) {
    try {
      await pollForm(form, savedState);
    } catch (err) {
      console.error(`[${form.name}] Poll error: ${err.message}`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const savedState = state.load();

  await initState(savedState);

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });

  console.log(`Polling ${FORMS.filter((f) => f.sheetId && f.webhookUrl).length} form(s) every ${POLL_INTERVAL_MS / 1000}s`);

  // Poll loop
  while (true) {
    await pollAll(savedState);
    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
