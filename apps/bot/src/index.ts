import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const roleId = process.env.DISCORD_WHITELIST_ROLE_ID;
const internalKey = process.env.INTERNAL_API_KEY;
const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:4010';

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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`bot prêt : ${c.user.tag}`);
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
