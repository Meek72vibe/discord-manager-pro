import {
    Client,
    GatewayIntentBits,
    Guild,
    GuildMember,
    PermissionFlagsBits,
} from "discord.js";
import { err, ToolResult } from "../types/action.js";
import { logInfo, logError } from "../logging/logger.js";

// ─── Client Singleton ─────────────────────────────────────────────────────────

let _client: Client | null = null;

export function getClient(): Client {
    if (!_client) {
        _client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildModeration,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildInvites,
                GatewayIntentBits.GuildScheduledEvents,
                GatewayIntentBits.GuildEmojisAndStickers,
                GatewayIntentBits.GuildWebhooks,
            ],
        });
    }
    return _client;
}

const _loginPromise: Promise<void> | null = null;

/**
 * Logs in the Discord client. Idempotent — safe to call multiple times.
 */
export async function loginClient(): Promise<void> {
    const client = getClient();
    if (client.isReady()) return;

    const token = process.env.DISCORD_TOKEN;
    if (!token) throw new Error("DISCORD_TOKEN is not set");

    await client.login(token);
    logInfo("discord:connected", { tag: client.user?.tag });
}

/** Graceful shutdown — destroy the Discord WebSocket connection. */
export function setupGracefulShutdown(): void {
    const cleanup = () => {
        if (_client?.isReady()) {
            logInfo("discord:shutdown");
            _client.destroy();
        }
        process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
}

// ─── Guild Helper ─────────────────────────────────────────────────────────────

export async function getDiscordGuild(guildId: string): Promise<Guild> {
    const client = getClient();
    const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId);
    if (!guild) throw new Error(`Guild "${guildId}" not found`);
    return guild;
}

// ─── Permission Enforcement ───────────────────────────────────────────────────

/**
 * Checks that the bot has required permissions in the guild.
 * Returns a PERMISSION_ERROR result if not, null if OK.
 */
export async function requireBotPermission(
    guild: Guild,
    ...perms: bigint[]
): Promise<ToolResult | null> {
    const me = await guild.members.fetchMe();
    const missing = perms.filter(p => !me.permissions.has(p));
    if (missing.length === 0) return null;

    const names = missing.map(
        p => Object.entries(PermissionFlagsBits).find(([, v]) => v === p)?.[0] ?? String(p)
    );
    return err(`Bot missing permissions: ${names.join(", ")}`, "PERMISSION_ERROR");
}

/**
 * Checks that the target member's highest role is BELOW the bot's highest role.
 * Prevents the bot from taking actions against admins or higher-ranked users.
 */
export async function requireRoleHierarchy(
    guild: Guild,
    targetMember: GuildMember
): Promise<ToolResult | null> {
    const me = await guild.members.fetchMe();
    if (targetMember.roles.highest.position >= me.roles.highest.position) {
        return err(
            `Cannot target ${targetMember.user.tag} — their role is equal or higher than mine.`,
            "PERMISSION_ERROR"
        );
    }
    return null;
}

/**
 * Blocks self-targeting actions.
 */
export function requireNotSelf(
    actorId: string,
    targetId: string,
    action: string
): ToolResult | null {
    if (actorId === targetId) {
        return err(`Cannot ${action} yourself.`, "PERMISSION_ERROR");
    }
    return null;
}

/**
 * Blocks targeting the server owner.
 */
export function requireNotOwner(
    guild: Guild,
    targetMember: GuildMember,
    action: string
): ToolResult | null {
    if (targetMember.id === guild.ownerId) {
        return err(`Cannot ${action} the server owner.`, "PERMISSION_ERROR");
    }
    return null;
}

/**
 * Combined moderation guard for all member-targeting actions.
 * Checks hierarchy, self-target, and owner-target in one call.
 */
export async function requireModerationTarget(
    guild: Guild,
    actorId: string,
    targetMember: GuildMember,
    action: string
): Promise<ToolResult | null> {
    const selfCheck = requireNotSelf(actorId, targetMember.id, action);
    if (selfCheck) return selfCheck;

    const ownerCheck = requireNotOwner(guild, targetMember, action);
    if (ownerCheck) return ownerCheck;

    const hierarchyCheck = await requireRoleHierarchy(guild, targetMember);
    if (hierarchyCheck) return hierarchyCheck;

    return null;
}
