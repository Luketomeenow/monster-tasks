/**
 * Build Discord embed for Typeform New Lead - matches sample format:
 * Qualified = green, "New Lead Optin - QUALIFIED", with Calendar Link
 * Unqualified = blue, "New Lead Optin", N/A where missing
 */
function buildNewLeadEmbed(lead) {
  const color = lead.qualified ? 0x2ecc71 : 0x3498db; // green : blue
  const title = lead.qualified ? 'New Lead Optin - QUALIFIED' : 'New Lead Optin';

  const fields = [
    { name: 'Time', value: lead.dateStr, inline: true },
    { name: 'Name', value: lead.name, inline: true },
    { name: 'Email', value: lead.email, inline: true },
    { name: 'Phone', value: lead.phone, inline: true },
    { name: 'Work Situation', value: lead.workSituation, inline: true },
    { name: 'Monthly Income', value: lead.monthlyIncome, inline: true },
    { name: 'Has Budget ($2-3k for tools/marketing)', value: lead.hasBudget, inline: true },
    { name: 'Package Selection', value: lead.packageSelection, inline: true },
    { name: 'Source', value: lead.source, inline: true },
    { name: 'OK with cost of program (Yes/No)', value: lead.programCostAnswer, inline: true },
    { name: 'Why Land Flipping', value: lead.whyLandFlipping, inline: false },
    {
      name: 'ATTRIBUTION',
      value: [
        `**Source:** ${lead.attribution.utmSource}`,
        `**Medium:** ${lead.attribution.utmMedium}`,
        `**Campaign:** ${lead.attribution.utmCampaign}`,
        `**Term:** ${lead.attribution.utmTerm}`,
        `**Content:** ${lead.attribution.utmContent}`,
      ].join('\n'),
      inline: false,
    },
  ];

  if (lead.calendarLink) {
    fields.push({
      name: 'Calendar Link',
      value: lead.calendarLink,
      inline: false,
    });
  }

  return {
    title,
    color,
    fields,
    footer: { text: 'BSM Form Bot' },
    timestamp: new Date().toISOString(),
  };
}

module.exports = { buildNewLeadEmbed };
