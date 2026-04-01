const { createFolderInParent } = require('./drive');
const {
  createOnboardingCategoryWithChannels,
  createGuildFromTemplate,
  parseChannelNameList,
} = require('./discordOnboarding');

function sanitizeFolderName(str) {
  return str.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Returns true if this form should trigger onboarding (when filter env is set).
 */
function shouldRunOnboardingForForm(formId) {
  const filter = (process.env.TYPEFORM_ONBOARDING_FORM_IDS || '').trim();
  if (!filter) return true;
  const allowed = filter.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(formId);
}

function hasDriveOnboarding() {
  return !!(process.env.GOOGLE_DRIVE_ONBOARDING_PARENT_ID || '').trim();
}

function hasDiscordTemplateOnboarding() {
  const token = (process.env.DISCORD_BOT_TOKEN || '').trim();
  const code = (process.env.DISCORD_GUILD_TEMPLATE_CODE || '').trim();
  return !!(token && code);
}

/** Hub server: category + channels under one guild */
function hasDiscordHubOnboarding() {
  const token = (process.env.DISCORD_BOT_TOKEN || '').trim();
  const guild = (process.env.DISCORD_ONBOARDING_GUILD_ID || '').trim();
  return !!(token && guild);
}

function hasDiscordOnboarding() {
  return hasDiscordTemplateOnboarding() || hasDiscordHubOnboarding();
}

function resolveDiscordServerName(lead) {
  const c = (lead.company || '').trim();
  if (c) return c;
  if (lead.name && lead.name !== 'N/A') return lead.name;
  const em = (lead.email || '').trim();
  if (em && em !== 'N/A') return em.split('@')[0] || em;
  return 'New client';
}

/**
 * Run Drive folder + Discord category/channels after a Typeform lead is parsed.
 * Fail-soft: each step catches and logs; does not throw to caller.
 */
async function runOnboardingProvisioning({ lead, parsed }) {
  const formId = parsed.formId || '';
  if (!shouldRunOnboardingForForm(formId)) {
    console.log('[Onboarding] Skipped — form_id not in TYPEFORM_ONBOARDING_FORM_IDS:', formId || '(empty)');
    return { skipped: true, reason: 'form_filter' };
  }

  if (!hasDriveOnboarding() && !hasDiscordOnboarding()) {
    console.log('[Onboarding] Skipped — no GOOGLE_DRIVE_ONBOARDING_PARENT_ID and no Discord bot/guild configured');
    return { skipped: true, reason: 'not_configured' };
  }

  const datePart = parsed.dateStr || new Date().toISOString().slice(0, 10);
  const baseName =
    (lead.company && String(lead.company).trim()) ||
    (lead.name && lead.name !== 'N/A' ? lead.name : '') ||
    lead.email ||
    'Client';
  const folderCategoryLabel = `${sanitizeFolderName(baseName)} — ${datePart}`;

  const result = { drive: null, discord: null, errors: [] };

  if (hasDriveOnboarding()) {
    try {
      const parentId = process.env.GOOGLE_DRIVE_ONBOARDING_PARENT_ID.trim();
      const folder = await createFolderInParent(folderCategoryLabel, parentId);
      result.drive = folder;
      console.log('[Onboarding] Drive folder created:', folder.webViewLink || folder.id);
    } catch (err) {
      const msg = err.message || String(err);
      result.errors.push({ step: 'drive', message: msg });
      console.error('[Onboarding] Drive failed:', msg);
    }
  }

  if (hasDiscordTemplateOnboarding()) {
    try {
      const templateCode = process.env.DISCORD_GUILD_TEMPLATE_CODE.trim();
      const serverName = resolveDiscordServerName(lead);
      const discord = await createGuildFromTemplate(templateCode, serverName);
      result.discord = { mode: 'template', ...discord };
      console.log('[Onboarding] Discord guild from template:', discord.guildId, discord.name);
    } catch (err) {
      const msg = err.message || String(err);
      result.errors.push({ step: 'discord', message: msg });
      console.error('[Onboarding] Discord (template) failed:', msg);
    }
  } else if (hasDiscordHubOnboarding()) {
    try {
      const channels = parseChannelNameList();
      const discord = await createOnboardingCategoryWithChannels(folderCategoryLabel, channels);
      result.discord = { mode: 'hub', ...discord };
      console.log('[Onboarding] Discord category created:', discord.categoryId, 'channels:', discord.channels.length);
    } catch (err) {
      const msg = err.message || String(err);
      result.errors.push({ step: 'discord', message: msg });
      console.error('[Onboarding] Discord failed:', msg);
    }
  }

  return result;
}

module.exports = {
  runOnboardingProvisioning,
  shouldRunOnboardingForForm,
  hasDriveOnboarding,
  hasDiscordOnboarding,
  hasDiscordTemplateOnboarding,
  hasDiscordHubOnboarding,
};
