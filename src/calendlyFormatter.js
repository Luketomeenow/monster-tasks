/**
 * Build Discord embed for Calendly bookings (call booked).
 * Uses same style as GHL booked call – teal, same DISCORD_WEBHOOK_BOOKED_CALL channel.
 */
function formatCalendlyDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

/**
 * Build embed for a Calendly scheduled event (invitee + event details).
 * @param {object} opts - { name, email, eventName, startTime, endTime, meetingLink, inviteeUri }
 */
function buildCalendlyBookedEmbed(opts) {
  const name = opts.name || '—';
  const email = opts.email || '—';
  const eventName = opts.eventName || 'Call booked';
  const start = formatCalendlyDate(opts.startTime);
  const end = formatCalendlyDate(opts.endTime);
  const meetingLink = opts.meetingLink || opts.location || '';

  const fields = [
    { name: 'Event', value: eventName, inline: true },
    { name: 'Name', value: name, inline: true },
    { name: 'Email', value: email, inline: true },
    { name: 'Start', value: start, inline: true },
    { name: 'End', value: end, inline: true },
  ];

  if (meetingLink) {
    fields.push({ name: 'Meeting link', value: meetingLink, inline: false });
  }

  return {
    title: '📅 Call booked (Calendly)',
    color: 0x1abc9c,
    fields,
    footer: { text: 'BSM Bot · Calendly' },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Minimal embed when we only have URIs (no API token).
 */
function buildCalendlyBookedMinimalEmbed(eventUri, inviteeUri) {
  return {
    title: '📅 Call booked (Calendly)',
    color: 0x1abc9c,
    description: 'A new Calendly booking was received. Set `CALENDLY_ACCESS_TOKEN` in Railway to show name, email, and event details.',
    fields: [
      { name: 'Event URI', value: eventUri || '—', inline: false },
      { name: 'Invitee URI', value: inviteeUri || '—', inline: false },
    ],
    footer: { text: 'BSM Bot · Calendly' },
    timestamp: new Date().toISOString(),
  };
}

module.exports = { buildCalendlyBookedEmbed, buildCalendlyBookedMinimalEmbed, formatCalendlyDate };
