/**
 * Build Discord embed for Typeform New Lead.
 * Dynamically shows all Typeform answers using their actual question titles.
 * Qualified (green) = said Yes to investment question or has calendar link.
 * Unqualified (blue) = said No or question not found.
 */
function buildNewLeadEmbed(lead) {
  const color = lead.qualified ? 0x2ecc71 : 0x3498db;
  const title = lead.qualified ? 'New Lead Optin - QUALIFIED' : 'New Lead Optin';

  const embedFields = [
    { name: 'Time', value: lead.dateStr, inline: true },
    { name: 'Name', value: lead.name, inline: true },
    { name: 'Email', value: lead.email, inline: true },
    { name: 'Phone', value: lead.phone, inline: true },
  ];

  // Add all Typeform answers (skip first/last name, email, phone since they're already above)
  const skipPatterns = ['first name', 'last name', 'email', 'phone', 'full name'];
  for (const f of lead.fields) {
    const lower = f.title.toLowerCase();
    if (skipPatterns.some((p) => lower.includes(p))) continue;

    const val = f.value || 'N/A';
    embedFields.push({
      name: f.title,
      value: val.length > 1024 ? val.slice(0, 1021) + '...' : val,
      inline: val.length < 100,
    });
  }

  // Attribution from hidden fields (UTM etc.)
  const h = lead.hidden || {};
  const hiddenEntries = Object.entries(h).filter(([, v]) => v && String(v).trim());
  if (hiddenEntries.length > 0) {
    const attrLines = hiddenEntries.map(([k, v]) => {
      const label = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (s) => s.toUpperCase());
      return `**${label}:** ${v}`;
    });
    embedFields.push({
      name: 'ATTRIBUTION',
      value: attrLines.join('\n'),
      inline: false,
    });
  }

  if (lead.calendarLink) {
    embedFields.push({
      name: 'Calendar Link',
      value: lead.calendarLink,
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
