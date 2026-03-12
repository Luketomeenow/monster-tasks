const express = require('express');
const { FORMS, POLL_INTERVAL_MS } = require('./config');
const { getRowCount, getNewRows } = require('./sheets');
const { sendEmbed } = require('./discord');
const { buildEmbed } = require('./formatters');
const { parsePayload, buildLeadFromParsed } = require('./typeform');
const { buildNewLeadEmbed } = require('./typeformFormatter');
const state = require('./state');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), forms: FORMS.length });
});

app.post('/typeform/webhook', (req, res) => {
  const webhookUrl = process.env.DISCORD_WEBHOOK_NEW_LEAD;
  if (!webhookUrl) {
    console.error('[Typeform] DISCORD_WEBHOOK_NEW_LEAD not set');
    res.status(500).json({ error: 'New lead webhook not configured' });
    return;
  }

  const parsed = parsePayload(req.body);
  if (!parsed) {
    res.status(400).json({ error: 'Invalid Typeform webhook payload' });
    return;
  }

  const lead = buildLeadFromParsed(parsed);
  const embed = buildNewLeadEmbed(lead);

  sendEmbed(webhookUrl, embed)
    .then(() => {
      console.log(`[Typeform] New lead sent to Discord (${lead.qualified ? 'QUALIFIED' : 'Unqualified'})`);
      res.status(200).send();
    })
    .catch((err) => {
      console.error('[Typeform] Discord webhook failed:', err.message);
      res.status(500).json({ error: 'Failed to send to Discord' });
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
