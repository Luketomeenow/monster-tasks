/**
 * Build Discord embed for Typeform New Lead.
 * Dynamically shows all Typeform answers using their actual question titles.
 * Qualified (green) = said Yes to investment question or has calendar link.
 * Unqualified (blue) = said No or question not found.
 */

function safe(str, fallback) {
  const s = (str || '').trim();
  return s.length > 0 ? s : fallback || '—';
}

function truncName(str) {
  const s = safe(str, 'Field');
  return s.length > 256 ? s.slice(0, 253) + '...' : s;
}

function truncValue(str) {
  const s = safe(str, '—');
  return s.length > 1024 ? s.slice(0, 1021) + '...' : s;
}

function buildNewLeadEmbed(lead) {
  const color = lead.qualified ? 0x2ecc71 : 0x3498db;
  const title = lead.qualified ? 'New Lead Optin - QUALIFIED' : 'New Lead Optin';

  const embedFields = [
    { name: 'Time', value: safe(lead.dateStr, '—'), inline: true },
    { name: 'Name', value: safe(lead.name, '—'), inline: true },
    { name: 'Email', value: safe(lead.email, '—'), inline: true },
    { name: 'Phone', value: safe(lead.phone, '—'), inline: true },
  ];

  const skipPatterns = ['first name', 'last name', 'email', 'phone', 'full name'];
  for (const f of (lead.fields || [])) {
    const lower = (f.title || '').toLowerCase();
    if (skipPatterns.some((p) => lower.includes(p))) continue;

    const fieldName = truncName(f.title);
    const fieldValue = truncValue(f.value);
    embedFields.push({
      name: fieldName,
      value: fieldValue,
      inline: fieldValue.length < 100,
    });
  }

  const h = lead.hidden || {};
  const hiddenEntries = Object.entries(h).filter(([, v]) => v && String(v).trim());
  if (hiddenEntries.length > 0) {
    const attrLines = hiddenEntries.map(([k, v]) => {
      const label = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase());
      return `**${label}:** ${v}`;
    });
    embedFields.push({
      name: 'ATTRIBUTION',
      value: truncValue(attrLines.join('\n')),
      inline: false,
    });
  }

  if (lead.calendarLink) {
    embedFields.push({
      name: 'Calendar Link',
      value: truncValue(lead.calendarLink),
      inline: false,
    });
  }

  return {
    title,
    color,
    fields: embedFields,
    footer: { text: 'BSM Form Bot' },
    timestamp: new Date().toISOString(),
  };
}

module.exports = { buildNewLeadEmbed };
