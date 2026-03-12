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

module.exports = { buildGhlBookedCallEmbed };
