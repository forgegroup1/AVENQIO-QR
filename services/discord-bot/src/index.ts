import { ActivityType, Client, Events, GatewayIntentBits, Partials, type Guild } from 'discord.js';
import { createApiClient, type BotApi } from './api';
import { commands, createCommandHandler } from './commands';
import { loadEnv, readConfig, type BotConfig } from './config';
import { logger, setLogLevel } from './logger';

const SHUTDOWN_TIMEOUT_MS = 8_000;

export function buildClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      // Needed to resolve the member invoking /avenqio verify so we can check
      // Manage Server. The bot never reads message content.
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.GuildMember],
    // One official bot serves every server: no per-customer sharding or tokens.
  });
}

/** Syncs guild metadata using a dashboard link that the bot has no rights to change on its own. */
async function syncGuild(api: BotApi, guild: Guild): Promise<void> {
  try {
    await api.syncGuild({
      guildId: guild.id,
      name: guild.name,
      iconHash: guild.icon,
      memberCount: guild.memberCount,
      ownerDiscordId: guild.ownerId,
    });
    logger.debug('guild synced', { guildId: guild.id });
  } catch (error) {
    logger.warn('guild sync failed', {
      guildId: guild.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function registerCommands(client: Client, config: BotConfig): Promise<void> {
  if (!client.application) throw new Error('Discord application is not available.');
  if (config.devGuildId) {
    await client.application.commands.set([]);
    const guild = await client.guilds.fetch(config.devGuildId);
    await guild.commands.set(commands);
    logger.info('slash commands registered for the development guild', { guildId: config.devGuildId });
    return;
  }
  await client.application.commands.set(commands);
  logger.info('global slash commands registered', { count: commands.length });
}

async function main(): Promise<void> {
  loadEnv();
  const result = readConfig();
  if (!result.ok) {
    console.error('\nThe AvenqioPresence bot cannot start:\n');
    for (const problem of result.problems) console.error(`  • ${problem}`);
    console.error('\nCopy .env.example to .env.local and fill in the Discord section.\n');
    process.exit(1);
  }

  const { config } = result;
  setLogLevel(config.logLevel);

  const api = createApiClient({ baseUrl: config.apiUrl, serviceToken: config.serviceToken });
  const client = buildClient();
  const handleCommand = createCommandHandler({ api, config: { dashboardUrl: config.dashboardUrl } });

  client.once(Events.ClientReady, async (ready) => {
    logger.info('bot online', { user: ready.user.tag, guilds: ready.guilds.cache.size });

    try {
      await registerCommands(ready, config);
    } catch (error) {
      logger.error('could not register slash commands', {
        message: error instanceof Error ? error.message : String(error),
        hint: 'Check that the bot was invited with the applications.commands scope.',
      });
    }

    ready.user.setPresence({
      status: 'online',
      activities: [{ name: 'presence synced by the desktop companion', type: ActivityType.Watching }],
    });

    // The bot keeps community metadata fresh; it never publishes a user presence.
    for (const guild of ready.guilds.cache.values()) {
      await syncGuild(api, guild);
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    logger.info('joined guild', { guildId: guild.id, name: guild.name });
    await syncGuild(api, guild);
  });

  client.on(Events.GuildDelete, async (guild) => {
    logger.info('left guild', { guildId: guild.id });
    try {
      await api.leaveGuild(guild.id);
    } catch (error) {
      logger.warn('could not mark the community as bot-less', {
        guildId: guild.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  client.on(Events.GuildUpdate, async (_old, guild) => {
    await syncGuild(api, guild);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'avenqio') return;
    try {
      await handleCommand(interaction);
    } catch (error) {
      logger.error('unhandled command error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  client.on(Events.Error, (error) => logger.error('gateway error', { message: error.message }));
  client.on(Events.Warn, (message) => logger.warn(`gateway warning: ${message}`));

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`received ${signal}, disconnecting`);
    const timer = setTimeout(() => {
      logger.warn('shutdown timeout reached, exiting');
      process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    await client.destroy().catch(() => undefined);
    clearTimeout(timer);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await api.health();
  } catch (error) {
    logger.warn('API health check failed — the bot will still connect and retry', {
      url: config.apiUrl,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  await client.login(config.token).catch((error: unknown) => {
    logger.error('Discord rejected the login', {
      message: error instanceof Error ? error.message : String(error),
      hint: 'Check DISCORD_BOT_TOKEN and that the bot is not disabled in the developer portal.',
    });
    process.exit(1);
  });
}

const printCommands = process.argv.includes('--print-commands');
if (printCommands) {
  // Lets CI and operators inspect the registered command surface without a token.
  console.log(JSON.stringify(commands, null, 2));
} else {
  main().catch((error: unknown) => {
    logger.error('fatal error', { message: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
}
