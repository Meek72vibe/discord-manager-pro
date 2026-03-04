import {
  Client, GatewayIntentBits, Guild, TextChannel,
  Partials, PermissionFlagsBits, PermissionResolvable
} from "discord.js";
import { logReady, log } from "../utils/logger.js";

// ─── DISCORD CLIENT ───────────────────────────────────────────────────────────
// Intents requested (and why):
//   Guilds          — required to access guild/channel structure
//   GuildMessages   — required to read and send messages
//   GuildMembers    — PRIVILEGED: required for member list & management
//   MessageContent  — PRIVILEGED: required to read message text for AI analysis
//
// Note: Apps in 100+ servers must apply for privileged intents via Discord portal.

let _client: Client | null = null;

export async function getDiscordClient(): Promise<Client> {
  if (_client?.isReady()) return _client;

  _client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,    // PRIVILEGED
      GatewayIntentBits.MessageContent,  // PRIVILEGED
    ],
    // Handle partial structures — Discord sometimes returns incomplete objects
    // for uncached messages/channels. We resolve them before use.
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.GuildMember,
    ],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Discord login timeout after 30s")), 30_000);
    _client!.once("ready", (c) => {
      clearTimeout(timeout);
      logReady(c.user.tag);
      resolve();
    });
    _client!.once("error", (e) => { clearTimeout(timeout); reject(e); });
    _client!.login(process.env.DISCORD_TOKEN).catch((e) => { clearTimeout(timeout); reject(e); });
  });

  return _client!;
}

export async function getGuild(): Promise<Guild> {
  const client = await getDiscordClient();
  const guildId = process.env.DISCORD_GUILD_ID!;

  try {
    // Force full fetch — avoids stale cache
    const guild = await client.guilds.fetch(guildId);
    if (!guild) throw new Error(`Bot is not a member of guild ${guildId}`);
    return guild;
  } catch (e: any) {
    if (e.code === 10004) throw new Error(`Guild ${guildId} not found. Is the bot invited to your server?`);
    throw e;
  }
}

export async function getTextChannel(channelId: string): Promise<TextChannel> {
  const client = await getDiscordClient();
  const channel = await client.channels.fetch(channelId);
  if (!channel) throw new Error(`Channel ${channelId} not found`);

  // Resolve partials — partial channels only have an ID, nothing else
  if (channel.partial) await (channel as any).fetch();

  if (!channel.isTextBased())
    throw new Error(`Channel ${channelId} is not a text channel`);
  return channel as TextChannel;
}

// ─── PERMISSION GUARD ─────────────────────────────────────────────────────────
// Call before any moderation action.
// Throws a clear human-readable error if bot lacks permission.

export async function requireBotPermission(
  guild: Guild,
  ...permissions: PermissionResolvable[]
): Promise<void> {
  const me = guild.members.me ?? await guild.members.fetchMe();
  for (const perm of permissions) {
    if (!me.permissions.has(perm)) {
      const name = Object.entries(PermissionFlagsBits)
        .find(([, v]) => v === perm)?.[0] ?? String(perm);
      throw new Error(`Bot is missing permission: ${name}. Please update the bot's role in your server.`);
    }
  }
}

// ─── ROLE HIERARCHY GUARD ─────────────────────────────────────────────────────
// Discord won't let a bot modify roles/members at or above its own highest role.

export async function requireRoleHierarchy(guild: Guild, targetRolePosition: number): Promise<void> {
  const me = guild.members.me ?? await guild.members.fetchMe();
  const botHighest = me.roles.highest.position;
  if (targetRolePosition >= botHighest) {
    throw new Error(
      `Cannot modify this role — it is equal to or higher than the bot's own role. ` +
      `Move the bot's role above the target role in Server Settings → Roles.`
    );
  }
}

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────

export function setupGracefulShutdown() {
  const shutdown = (signal: string) => {
    log("info", `Received ${signal} — shutting down gracefully...`);
    if (_client) {
      _client.destroy();
      log("info", "Discord client destroyed.");
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}
