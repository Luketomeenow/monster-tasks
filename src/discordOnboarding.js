const { REST, Routes, ChannelType } = require('discord.js');

/** Discord guild names: 2–100 characters. */
function sanitizeGuildName(str, fallback = 'New client') {
  let s = String(str || '')
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 100);
  if (s.length < 2) s = fallback.slice(0, 100);
  if (s.length < 2) s = 'Guild';
  return s;
}

/**
 * New guild from a server template (discord.new code).
 * Discord returns "Bots cannot use this endpoint" for bot tokens on POST /guilds/templates — use a user OAuth2 access token.
 * @returns {{ guildId: string, name: string }}
 */
async function createGuildFromTemplate(templateCode, serverName) {
  const code = (templateCode || '').trim();
  const userToken = (process.env.DISCORD_GUILD_TEMPLATE_USER_ACCESS_TOKEN || '').trim();
  if (!code) {
    throw new Error('DISCORD_GUILD_TEMPLATE_CODE is required to create a guild from template');
  }
  if (!userToken) {
    throw new Error(
      'Discord does not allow bot tokens to create servers from templates. Set DISCORD_GUILD_TEMPLATE_USER_ACCESS_TOKEN ' +
      'to a user OAuth2 access token with the `guilds` scope, or remove DISCORD_GUILD_TEMPLATE_CODE and use hub mode ' +
      '(DISCORD_ONBOARDING_GUILD_ID + DISCORD_BOT_TOKEN) instead.'
    );
  }

  const rest = new REST({ version: '10', authPrefix: 'Bearer' }).setToken(userToken);
  const name = sanitizeGuildName(serverName);
  const guild = await rest.post(Routes.template(code), {
    body: { name },
  });

  return { guildId: guild.id, name: guild.name };
}

function parseChannelNameList() {
  const raw = process.env.DISCORD_ONBOARDING_CHANNEL_NAMES || 'general,documents,notes,questions';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 100));
}

function slugifyChannelSegment(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'channel';
}

/**
 * Hub server model: create a category and text channels under it (Discord API).
 * Bot needs Manage Channels in the guild.
 */
async function createOnboardingCategoryWithChannels(categoryDisplayName, textChannelLabels) {
  const token = (process.env.DISCORD_BOT_TOKEN || '').trim();
  const guildId = (process.env.DISCORD_ONBOARDING_GUILD_ID || '').trim();
  if (!token || !guildId) {
    throw new Error('DISCORD_BOT_TOKEN and DISCORD_ONBOARDING_GUILD_ID are required for Discord onboarding');
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const catName = categoryDisplayName.slice(0, 100);

  const category = await rest.post(Routes.guildChannels(guildId), {
    body: {
      name: catName,
      type: ChannelType.GuildCategory,
    },
  });

  const categoryId = category.id;
  const created = [{ id: categoryId, name: category.name, kind: 'category' }];

  const names = textChannelLabels.length ? textChannelLabels : parseChannelNameList();

  for (const label of names) {
    const safe = slugifyChannelSegment(label);
    const body = {
      name: safe,
      type: ChannelType.GuildText,
      parent_id: categoryId,
    };
    if (label && label !== safe) {
      body.topic = label.slice(0, 1024);
    }
    const ch = await rest.post(Routes.guildChannels(guildId), { body });
    created.push({ id: ch.id, name: ch.name, kind: 'text' });
  }

  return { categoryId, channels: created, guildId };
}

module.exports = {
  createOnboardingCategoryWithChannels,
  createGuildFromTemplate,
  parseChannelNameList,
  slugifyChannelSegment,
  sanitizeGuildName,
};
