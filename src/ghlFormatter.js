/**
 * Build Discord embed for GHL calendar appointment booked (call booked).
 * Uses DISCORD_WEBHOOK_BOOKED_CALL - same channel as Google Form "Booked Call".
 */
function buildGhlBookedCallEmbed(appointment) {
  const start = appointment.startTime ? formatGhlDate(appointment.startTime) : '—';
  const end = appointment.endTime ? formatGhlDate(appointment.endTime) : '—';
  const title = appointment.title || 'Call booked';
  const status = appointment.appointmentStatus || '—';
  const source = appointment.source || '—';
  const notes = appointment.notes || '—';
  const address = appointment.address || '';

  const fields = [
    { name: 'Title', value: title, inline: true },
    { name: 'Status', value: status, inline: true },
    { name: 'Source', value: source, inline: true },
    { name: 'Start', value: start, inline: true },
    { name: 'End', value: end, inline: true },
    { name: 'Calendar ID', value: appointment.calendarId || '—', inline: true },
    { name: 'Notes', value: notes || '—', inline: false },
  ];

  if (address) {
    fields.push({ name: 'Meeting link', value: address, inline: false });
  }

  return {
    title: '📅 Call booked (GHL)',
    color: 0x1abc9c, // teal - same as Booked Call form
    fields,
    footer: { text: 'BSM Bot · GoHighLevel Calendar' },
    timestamp: new Date().toISOString(),
  };
}

function formatGhlDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/**
 * Build embed from GHL workflow webhook payload (contact details + any custom/trigger data).
 * GHL workflow "Fire a webhook" sends contact and custom data, not the developer AppointmentCreate shape.
 */
function buildGhlWorkflowEmbed(body) {
  const contact = body.contact || body;
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || contact.fullName || '—';
  const email = contact.email || body.email || '—';
  const phone = contact.phone || contact.phoneNumber || body.phone || '—';

  const fields = [
    { name: 'Name', value: name, inline: true },
    { name: 'Email', value: email, inline: true },
    { name: 'Phone', value: phone, inline: true },
  ];

  // Include any other top-level or contact fields that look useful (avoid huge objects)
  const skip = new Set(['contact', 'firstName', 'lastName', 'name', 'fullName', 'email', 'phone', 'phoneNumber']);
  for (const [key, value] of Object.entries(body)) {
    if (skip.has(key) || value == null || typeof value === 'object') continue;
    const str = String(value).trim();
    if (str.length > 0 && str.length < 1024) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      fields.push({ name: label, value: str, inline: true });
    }
  }

  return {
    title: '📅 Call booked (GHL)',
    color: 0x1abc9c,
    fields,
    footer: { text: 'BSM Bot · GoHighLevel Calendar' },
    timestamp: new Date().toISOString(),
  };
}

const OPPORTUNITY_STAGES = {
  no_show: { label: 'No show', color: 0xe74c3c },
  follow_up: { label: 'Follow up', color: 0xf39c12 },
  closed_deal: { label: 'Closed deal', color: 0x2ecc71 },
};

/**
 * Build GHL dashboard URL to open this contact (clickable name).
 * Supports: locationId + contactId, or contactId only.
 */
function getGhlContactUrl(body) {
  const contactId = body.contact?.id ?? body.contactId ?? body.contact_id ?? body.id ?? body.opportunity?.contactId ?? body.opportunity?.contact_id;
  if (!contactId) return null;
  const locationId = body.locationId ?? body.location_id ?? body.contact?.locationId ?? body.contact?.location_id ?? body.opportunity?.locationId ?? body.opportunity?.location_id;
  if (locationId) {
    return `https://app.gohighlevel.com/v2/location/${locationId}/contacts/contact/${contactId}`;
  }
  return `https://app.gohighlevel.com/v2/contacts/contact/${contactId}`;
}

/**
 * Build embed for opportunity pipeline stage (No show, Follow up, Closed deal).
 * stageKey: 'no_show' | 'follow_up' | 'closed_deal'
 * Name is clickable and links to the contact in GHL when contact ID is present.
 */
function buildGhlOpportunityEmbed(stageKey, body) {
  const stage = OPPORTUNITY_STAGES[stageKey] || { label: stageKey, color: 0x3498db };

  const contact = body.contact || body;
  const nameRaw = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || contact.fullName || '—';
  const contactUrl = getGhlContactUrl(body);
  const name = contactUrl ? `[${nameRaw}](<${contactUrl}>)` : nameRaw;
  const email = contact.email || body.email || '—';
  const phone = contact.phone || contact.phoneNumber || body.phone || '—';

  const fields = [
    { name: 'Stage', value: stage.label, inline: true },
    { name: 'Name', value: name, inline: true },
    { name: 'Email', value: email, inline: true },
    { name: 'Phone', value: phone, inline: true },
  ];

  const skip = new Set(['contact', 'stage', 'stageName', 'pipelineStage', 'status', 'firstName', 'lastName', 'name', 'fullName', 'email', 'phone', 'phoneNumber']);
  for (const [key, value] of Object.entries(body)) {
    if (skip.has(key) || value == null || typeof value === 'object') continue;
    const str = String(value).trim();
    if (str.length > 0 && str.length < 1024) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      fields.push({ name: label, value: str, inline: true });
    }
  }

  return {
    title: `📌 Pipeline: ${stage.label}`,
    color: stage.color,
    fields,
    footer: { text: 'BSM Bot · Opportunity Pipeline' },
    timestamp: new Date().toISOString(),
  };
}

module.exports = { buildGhlBookedCallEmbed, buildGhlWorkflowEmbed, buildGhlOpportunityEmbed };
