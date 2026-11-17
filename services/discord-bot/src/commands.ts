import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import type { BotApi, CommunitySummary } from './api';
import { ApiClientError } from './api';
import { logger } from './logger';

export const commands = [
  new SlashCommandBuilder()
    .setName('avenqio')
    .setDescription('AvenqioPresence community tools, managed from Discord.')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Show this server’s AvenqioPresence status.'),
    )
    .addSubcommand((sub) =>
      sub.setName('presets').setDescription('List the presence presets published to this server.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('link')
        .setDescription('Get the link to pair your Windows companion with your account.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('verify')
        .setDescription('Learn how community verification works (administrators only).'),
    ),
].map((command) => command.toJSON());

const BRAND = 0x8b5cf6;
const OK = 0x22c55e;
const WARN = 0xf59e0b;

function footer(embed: EmbedBuilder): EmbedBuilder {
  return embed.setFooter({ text: 'AvenqioPresence · presence is published by your own companion app' });
}

function statusEmbed(summary: CommunitySummary): EmbedBuilder {
  const published = summary.presets.length;
  return footer(
    new EmbedBuilder()
      .setColor(summary.server.verificationStatus === 'verified' ? OK : BRAND)
      .setTitle(summary.server.name)
      .setDescription(
        summary.server.verificationStatus === 'verified'
          ? 'This community is verified by Avenqio.'
          : 'This community is not verified yet. Presets are still delivered to members who are linked.',
      )
      .addFields(
        { name: 'Presets published', value: String(published), inline: true },
        { name: 'Members', value: summary.server.memberCount === null ? '—' : String(summary.server.memberCount), inline: true },
        { name: 'Linked accounts', value: String(summary.linkedMembers), inline: true },
      ),
  );
}

async function replyError(interaction: ChatInputCommandInteraction, error: unknown): Promise<void> {
  const isApi = error instanceof ApiClientError;
  const notFound = isApi && error.status === 404;
  const description = notFound
    ? 'This server is not connected to AvenqioPresence yet. A server administrator has to sign in on the dashboard once.'
    : isApi && error.status === 401
      ? 'The bot is not authorised by the API. Check that `BOT_SERVICE_TOKEN` matches the web app configuration.'
      : 'AvenqioPresence is temporarily unreachable. Try again in a moment.';
  logger.warn('command failed', { command: interaction.commandName, status: isApi ? error.status : 0 });
  await interaction.editReply({ embeds: [footer(new EmbedBuilder().setColor(WARN).setDescription(description))] });
}

export function createCommandHandler({ api, config }: { api: BotApi; config: { dashboardUrl: string } }) {
  return async function handle(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'AvenqioPresence commands only work inside a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const guild: Guild = interaction.guild;

    try {
      switch (sub) {
        case 'status': {
          const summary = await api.community(guild.id);
          await interaction.editReply({ embeds: [statusEmbed(summary)] });
          return;
        }
        case 'presets': {
          const summary = await api.community(guild.id);
          if (summary.presets.length === 0) {
            await interaction.editReply({
              embeds: [
                footer(
                  new EmbedBuilder()
                    .setColor(BRAND)
                    .setDescription('No preset is published yet. A preset manager can publish one from the dashboard.'),
                ),
              ],
            });
            return;
          }
          const lines = summary.presets
            .slice(0, 15)
            .map((preset) => `• **${preset.name}** — requires \`${preset.minRole}\` · ${preset.members} member${preset.members === 1 ? '' : 's'}`);
          await interaction.editReply({
            embeds: [
              footer(
                new EmbedBuilder()
                  .setColor(BRAND)
                  .setTitle(`Presets in ${summary.server.name}`)
                  .setDescription(lines.join('\n'))
                  .setURL(`${config.dashboardUrl}/dashboard/communities/${summary.server.id}`),
              ),
            ],
          });
          return;
        }
        case 'link': {
          await interaction.editReply({
            embeds: [
              footer(
                new EmbedBuilder()
                  .setColor(BRAND)
                  .setTitle('Pair your Windows companion')
                  .setDescription(
                    [
                      '1. Open **Settings → Connected devices** on the dashboard.',
                      '2. Generate a pairing code (valid for 10 minutes).',
                      '3. Enter the code in the companion app.',
                      '',
                      'The companion publishes your presence through your own Discord client — Avenqio never touches your Discord password.',
                    ].join('\n'),
                  )
                  .setURL(`${config.dashboardUrl}/dashboard/settings?tab=security`),
              ),
            ],
          });
          return;
        }
        case 'verify': {
          const member = await guild.members.fetch(interaction.user.id).catch(() => null);
          const canManage = member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false;
          if (!canManage) {
            await interaction.editReply({
              embeds: [
                footer(new EmbedBuilder().setColor(WARN).setDescription('Only server administrators can request verification.')),
              ],
            });
            return;
          }
          const summary = await api.community(guild.id);
          await interaction.editReply({
            embeds: [
              footer(
                new EmbedBuilder()
                  .setColor(summary.server.verificationStatus === 'verified' ? OK : BRAND)
                  .setTitle(`Verification · ${summary.server.verificationStatus}`)
                  .setDescription(
                    [
                      'Verification is what prevents another community from publishing presets under your name.',
                      'Request it from **Communities → your server → Verification** on the dashboard. Avenqio staff review owner rights and activity before approving.',
                    ].join('\n'),
                  )
                  .setURL(`${config.dashboardUrl}/dashboard/communities/${summary.server.id}`),
              ),
            ],
          });
          return;
        }
        default:
          await interaction.editReply({ content: 'Unknown command.' });
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  };
}
