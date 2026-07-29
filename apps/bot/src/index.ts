import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const roleId = process.env.DISCORD_WHITELIST_ROLE_ID;
const internalKey = process.env.INTERNAL_API_KEY;
const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:4010';
const ticketGuildId = process.env.DISCORD_TICKET_GUILD_ID;
const ticketCategoryId = process.env.DISCORD_TICKET_CATEGORY_ID;

if (!token || !guildId || !roleId || !internalKey) {
  console.error(
    'bot: configuration manquante (DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_WHITELIST_ROLE_ID, INTERNAL_API_KEY)',
  );
  process.exit(1);
}

async function notify(discordId: string, whitelisted: boolean): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/api/internal/whitelist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': internalKey as string },
      body: JSON.stringify({ discordId, whitelisted }),
    });
    if (!res.ok) console.error(`bot: notify échec ${res.status} pour ${discordId}`);
  } catch (err) {
    console.error('bot: notify erreur', err);
  }
}

async function forwardTicketMessage(channelId: string, discordUserId: string, discordUsername: string, content: string): Promise<void> {
  try {
    await fetch(`${apiUrl}/api/internal/tickets/discord-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': internalKey as string },
      body: JSON.stringify({ channelId, discordUserId, discordUsername, content }),
    });
  } catch (err) {
    console.error('bot: forwardTicketMessage erreur', err);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`bot prêt : ${c.user.tag}`);
});

client.on(Events.MessageCreate, (message) => {
  if (!ticketGuildId || message.guildId !== ticketGuildId) return;
  if (message.author.bot || message.system) return;
  const parentId = 'parentId' in message.channel ? message.channel.parentId : null;
  if (ticketCategoryId && parentId !== ticketCategoryId) return;
  const content = message.content?.trim();
  if (!content) return;
  void forwardTicketMessage(message.channelId, message.author.id, message.author.username, content);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const action = interaction.customId === 'ticket_close' ? 'close' : interaction.customId === 'ticket_delete' ? 'delete' : null;
  if (!action) return;
  if (ticketGuildId && interaction.guildId !== ticketGuildId) return;
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch {
    return;
  }
  try {
    const res = await fetch(`${apiUrl}/api/internal/tickets/discord-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': internalKey as string },
      body: JSON.stringify({ channelId: interaction.channelId, discordUserId: interaction.user.id, action }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    const msg = j.ok
      ? action === 'close'
        ? '🔒 Ticket fermé (le salon reste ouvert).'
        : '🗑️ Ticket supprimé — transcript envoyé dans les logs.'
      : j.reason === 'unknown_user'
        ? "Ton compte Discord n'est pas relié à un compte IRS."
        : "Action impossible.";
    await interaction.editReply({ content: msg }).catch(() => {});
  } catch (err) {
    console.error('bot: ticket action erreur', err);
    await interaction.editReply({ content: 'Erreur interne.' }).catch(() => {});
  }
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  if (newMember.guild.id !== guildId) return;
  const had = oldMember.roles.cache.has(roleId as string);
  const has = newMember.roles.cache.has(roleId as string);
  if (had && !has) void notify(newMember.id, false);
  else if (!had && has) void notify(newMember.id, true);
});

client.on(Events.GuildMemberRemove, (member) => {
  if (member.guild.id !== guildId) return;
  void notify(member.id, false);
});

client.on(Events.GuildBanAdd, (ban) => {
  if (ban.guild.id !== guildId) return;
  void notify(ban.user.id, false);
});

void client.login(token);
