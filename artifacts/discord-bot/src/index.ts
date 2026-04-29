import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type ButtonInteraction,
  type CategoryChannel,
  type ChatInputCommandInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type OverwriteResolvable,
  type StringSelectMenuInteraction,
  type TextChannel,
} from "discord.js";
import type { AutocompleteInteraction } from "discord.js";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addEntry,
  deleteEntry,
  getAllEntries,
  getEntry,
} from "./playerduo-store.js";

const token = process.env["DISCORD_BOT_TOKEN"];

if (!token) {
  console.error(
    "DISCORD_BOT_TOKEN environment variable was not provided. Bot login is disabled; only health-check server will run.",
  );
}

const PARENT_CATEGORY_NAME = "DANH MỤC TLE";
const TICKET_CATEGORY_NAME = "Ticker-user";
const RENT_CATEGORY_NAME = "Rent-Player";
const LOG_CHANNEL_NAMES = ["rent-log", "ticket-log", "logs", "log"];

const GAME_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Liên Quân Mobile", value: "lien_quan" },
  { label: "Liên Minh Huyền Thoại", value: "lmht" },
  { label: "Teamfight Tactics (TFT)", value: "tft" },
  { label: "Valorant", value: "valorant" },
  { label: "PUBG / PUBG Mobile", value: "pubg" },
  { label: "Free Fire", value: "freefire" },
  { label: "CS2 / CS:GO", value: "cs2" },
  { label: "Genshin Impact", value: "genshin" },
  { label: "Khác (ghi chú trong chat)", value: "other" },
];

const HOUR_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "1 giờ", value: "1" },
  { label: "2 giờ", value: "2" },
  { label: "3 giờ", value: "3" },
  { label: "5 giờ", value: "5" },
  { label: "10 giờ", value: "10" },
  { label: "Cả ngày", value: "day" },
  { label: "Tâm sự / không tính giờ", value: "chat" },
];

interface RentState {
  guildId: string;
  channelId: string;
  renterId: string;
  code?: string;
  playerId?: string;
  game?: string;
  gameLabel?: string;
  hour?: string;
  hourLabel?: string;
  dmSent: boolean;
}

const rentStates = new Map<string, RentState>();

function getOrInitRentState(
  channelId: string,
  guildId: string,
  renterId: string,
): RentState {
  let s = rentStates.get(channelId);
  if (!s) {
    s = { channelId, guildId, renterId, dmSent: false };
    rentStates.set(channelId, s);
  }
  return s;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Gửi form tạo Ticker hỗ trợ")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("rent-panel")
    .setDescription("Gửi panel Thuê Player vào kênh được chọn")
    .addChannelOption((opt) =>
      opt
        .setName("kenh")
        .setDescription("Kênh sẽ đăng panel Thuê Player")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("playerduo")
    .setDescription("Tạo dữ liệu người dùng PlayerDuo (chỉ admin)")
    .addChannelOption((opt) =>
      opt
        .setName("kenh")
        .setDescription("Kênh sẽ đăng bài giới thiệu")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("so")
        .setDescription("Mã số (ví dụ: 09)")
        .setRequired(true)
        .setMaxLength(10),
    )
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User được giới thiệu")
        .setRequired(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("playerduo-edit")
    .setDescription("Chỉnh sửa dữ liệu PlayerDuo đã lưu (chỉ admin)")
    .addStringOption((opt) =>
      opt
        .setName("so")
        .setDescription("Mã số PlayerDuo (gõ để chọn)")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("playerduo-delete")
    .setDescription("Xóa dữ liệu PlayerDuo đã lưu (chỉ admin)")
    .addStringOption((opt) =>
      opt
        .setName("so")
        .setDescription("Mã số PlayerDuo (gõ để chọn)")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("playerduo-resend")
    .setDescription("Gửi lại dữ liệu PlayerDuo đã lưu vào kênh được chọn (chỉ admin)")
    .addChannelOption((opt) =>
      opt
        .setName("kenh")
        .setDescription("Kênh sẽ đăng lại dữ liệu PlayerDuo")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("so")
        .setDescription("Mã số PlayerDuo (gõ để chọn)")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .toJSON(),
];

async function registerCommands(clientId: string) {
  const rest = new REST({ version: "10" }).setToken(token!);
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(`Registered commands for guild: ${guild.name} (${guildId})`);
    } catch (err) {
      console.error(`Failed to register commands for guild ${guildId}:`, err);
    }
  }
}

// =================== /panel (Ticker hỗ trợ) ===================

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Form hỗ trợ - Tạo Ticker")
    .setDescription(
      "Nhấn nút **🎫 Ticker** bên dưới để mở form tạo phiếu hỗ trợ.\n" +
        "Sau khi gửi, một kênh riêng sẽ được tạo cho bạn và đội ngũ quản trị.",
    );
}

function buildPanelButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("open_modal_ticker")
      .setLabel("Ticker")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎫"),
  );
}

function buildTickerModal() {
  const modal = new ModalBuilder()
    .setCustomId("modal_ticker")
    .setTitle("Tạo Ticker hỗ trợ");

  const subjectInput = new TextInputBuilder()
    .setCustomId("ticker_subject")
    .setLabel("Tiêu đề")
    .setPlaceholder("Nhập tiêu đề ngắn gọn...")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const detailsInput = new TextInputBuilder()
    .setCustomId("ticker_details")
    .setLabel("Nội dung chi tiết")
    .setPlaceholder("Mô tả vấn đề của bạn...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);

  const imageInput = new TextInputBuilder()
    .setCustomId("ticker_image")
    .setLabel("Ảnh đính kèm (URL, nếu có)")
    .setPlaceholder("https://... (dán link ảnh, có thể bỏ trống)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(detailsInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
  );

  return modal;
}

// =================== Helpers ===================

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function vnTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts["hour"]}h${parts["minute"]}-${parts["day"]}-${parts["month"]}-${parts["year"]}`;
}

function sanitizeChannelName(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "user"
  );
}

async function findOrCreateCategory(
  guild: Guild,
  name: string,
): Promise<CategoryChannel> {
  const existing = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildCategory && ch.name === name,
  ) as CategoryChannel | undefined;
  if (existing) return existing;

  const parent = guild.channels.cache.find(
    (ch) =>
      ch.type === ChannelType.GuildCategory && ch.name === PARENT_CATEGORY_NAME,
  ) as CategoryChannel | undefined;

  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    position: parent ? parent.position + 1 : undefined,
  });
}

function findLogChannel(guild: Guild): TextChannel | null {
  for (const name of LOG_CHANNEL_NAMES) {
    const ch = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === name,
    ) as TextChannel | undefined;
    if (ch) return ch;
  }
  return null;
}

function buildPrivateOverwrites(
  guild: Guild,
  userId: string,
): OverwriteResolvable[] {
  const adminRoles = guild.roles.cache.filter((role) =>
    role.permissions.has(PermissionFlagsBits.Administrator),
  );
  const overwrites: OverwriteResolvable[] = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  if (client.user) {
    overwrites.push({
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  for (const [, role] of adminRoles) {
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  return overwrites;
}

function memberIsAdmin(member: ButtonInteraction["member"]): boolean {
  return Boolean(
    member &&
      "permissions" in member &&
      typeof member.permissions !== "string" &&
      member.permissions.has(PermissionFlagsBits.Administrator),
  );
}

// =================== /rent-panel ===================

function buildRentPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0xff5f8a)
    .setTitle("THE LIFE EVER - Create Rent Ticket")
    .setDescription(
      "**Chào mừng bạn đến với Thuê người chơi tại THE LIFE EVER!**\n" +
        "Vui lòng mở một vé, bằng cách chọn loại bên dưới!\n\n" +
        "Nếu phát hiện lỗi , tố cáo hoặc bất kỳ điều gì khác có thể yêu cầu nhân viên, vui lòng mở phiếu hỗ trợ.\n\n" +
        "`Lạm dụng vé sẽ dẫn đến blacklist!`",
    );
}

function buildRentPanelButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("rent_guide")
      .setLabel("Hướng dẫn")
      .setStyle(ButtonStyle.Success)
      .setEmoji("📝"),
    new ButtonBuilder()
      .setCustomId("rent_open")
      .setLabel("Thuê Player")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🙋"),
    new ButtonBuilder()
      .setCustomId("rent_complain")
      .setLabel("Khiếu nại ADmin")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("👮"),
  );
}

const RENT_GUIDE_IMAGE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../assets/rent-guide.png",
);

async function handleRentGuide(interaction: ButtonInteraction) {
  const guideEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Cách vận hành IDEA RENT PLAYER:")
    .setDescription(
      "• **List**: gồm có mã số danh sách kèm CV_Profile của iDol-PlayerDuo Member trong kênh #𝗟𝗘𝗚𝗜𝗧-𝗣𝗟𝗔𝗬𝗗𝗨𝗢-𝗟𝗜𝗦𝗧\n\n" +
        "• **Ticker** là thứ vận hành để người thuê muốn giao tiếp (lựa chọn danh sách PlayerDuo - game mong muốn).\n\n" +
        "• **Ticker**: Click vào nút **Thuê Player**\n\n" +
        "• Sau khi chọn nút **Thuê Player**, BOT sẽ tạo ra một kênh chat. Chọn mã số tương ứng với PLAYERDUO LIST, tựa game hoặc nội dung mong muốn kèm theo, giờ chơi.\n\n" +
        "➡️ **Trường hợp Đóng vé thuê**: BOT sẽ xóa Ticker và đưa vào kênh **LOG**.\n\n" +
        "⚠️ **NOTE**: Lạm dụng vé sẽ dẫn đến **BANNNNNNNNNNNNNNNNNNNN!**",
    )
    .setImage("attachment://rent-guide.png");

  const buildAttachment = () =>
    new AttachmentBuilder(RENT_GUIDE_IMAGE_PATH, { name: "rent-guide.png" });

  let dmFailed = false;
  try {
    await interaction.user.send({
      embeds: [guideEmbed],
      files: [buildAttachment()],
    });
  } catch (err) {
    console.error("Error DMing guide:", err);
    dmFailed = true;
  }

  if (dmFailed) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        "⚠️ Không gửi được DM cho bạn. Vui lòng bật **Allow direct messages from server members** trong Privacy Settings rồi thử lại.",
      embeds: [guideEmbed],
      files: [buildAttachment()],
    });
  } else {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: "📬 Mình đã gửi hướng dẫn vào tin nhắn riêng (DM) cho bạn rồi nhé!",
    });
  }
}

async function handleRentOpen(interaction: ButtonInteraction) {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: "Lệnh này chỉ dùng được trong server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const user = interaction.user;

  try {
    const category = await findOrCreateCategory(guild, RENT_CATEGORY_NAME);

    const username =
      "displayName" in interaction.member &&
      typeof interaction.member.displayName === "string"
        ? interaction.member.displayName
        : user.username;

    const channelName = `rent-${sanitizeChannelName(username)}-${vnTimestamp()}`;
    const overwrites = buildPrivateOverwrites(guild, user.id);

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
      topic: `Vé Thuê Player của ${user.tag}`,
    });

    // Build dropdowns
    const entries = await getAllEntries();
    const codeOptions =
      entries.length > 0
        ? entries.slice(0, 25).map((e) => ({
            label: e.code,
            value: e.code,
            description: `User ID ${e.userId}`.slice(0, 100),
          }))
        : [
            {
              label: "(Chưa có dữ liệu PlayerDuo)",
              value: "_none_",
              description: "Admin hãy dùng /playerduo để thêm.",
            },
          ];

    const codeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rent_code:${user.id}`)
        .setPlaceholder("Chọn mã số tương ứng với PLAYERDUO LIST")
        .addOptions(codeOptions),
    );

    const gameRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rent_game:${user.id}`)
        .setPlaceholder("Chọn tựa Game")
        .addOptions(GAME_OPTIONS),
    );

    const hourRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rent_hour:${user.id}`)
        .setPlaceholder("Chọn giờ thuê")
        .addOptions(HOUR_OPTIONS),
    );

    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_rent:${user.id}`)
        .setLabel("Đóng vé Thuê Player")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🔒"),
    );

    const embed = new EmbedBuilder()
      .setColor(0xff5f8a)
      .setTitle("Đã tạo vé RENT PLAYER")
      .setDescription(
        "Xin chào và chào mừng bạn đến với **RENT PLAYER**\n" +
          "Vui lòng chọn loại bên dưới cụ thể để tiếp tục Thuê Player\n\n" +
          "`NOTE: Lạm dụng vé sẽ dẫn đến blacklist!`\n" +
          "*Vô tình tạo ra vé này? Nhấp vào nút đóng để xóa vé này.*",
      );

    await channel.send({
      content: `<@${user.id}>`,
      embeds: [embed],
      components: [codeRow, gameRow, hourRow, closeRow],
      allowedMentions: { users: [user.id] },
    });

    await interaction.editReply({
      content: `✅ Đã tạo vé Thuê Player: <#${channel.id}>`,
    });
  } catch (err) {
    console.error("Error creating rent ticket:", err);
    await interaction.editReply({
      content:
        "Không thể tạo vé. Hãy đảm bảo bot có quyền **Manage Channels** trong server.",
    });
  }
}

async function handleRentSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.guild || !interaction.channel) return;

  const value = interaction.values[0] ?? "";
  const id = interaction.customId;
  const renterId = id.split(":")[1] ?? interaction.user.id;
  const channelId = interaction.channel.id;
  const state = getOrInitRentState(channelId, interaction.guild.id, renterId);

  if (id.startsWith("rent_code:")) {
    if (value === "_none_") {
      await interaction.reply({
        content: "📌 **Mã số PlayerDuo:** (Chưa có dữ liệu)",
      });
      return;
    }
    const entry = await getEntry(value);
    if (!entry) {
      await interaction.reply({
        content: `📌 Không tìm thấy mã ${value}.`,
      });
      return;
    }
    state.code = value;
    state.playerId = entry.userId;

    const infoEmbed = new EmbedBuilder()
      .setColor(0xff66aa)
      .setTitle(entry.code)
      .setDescription(`<@${entry.userId}>\n${entry.details}`);
    if (entry.imageUrl) infoEmbed.setImage(entry.imageUrl);

    await interaction.reply({
      content: `📌 **Mã số PlayerDuo:** ${entry.code} — chọn bởi <@${interaction.user.id}>`,
      embeds: [infoEmbed],
      allowedMentions: { users: [interaction.user.id] },
    });
  } else if (id.startsWith("rent_game:")) {
    state.game = value;
    state.gameLabel =
      GAME_OPTIONS.find((o) => o.value === value)?.label ?? value;
    await interaction.reply({
      content: `📌 **Tựa Game:** ${state.gameLabel} — chọn bởi <@${interaction.user.id}>`,
      allowedMentions: { users: [interaction.user.id] },
    });
  } else if (id.startsWith("rent_hour:")) {
    state.hour = value;
    state.hourLabel =
      HOUR_OPTIONS.find((o) => o.value === value)?.label ?? value;
    await interaction.reply({
      content: `📌 **Giờ thuê:** ${state.hourLabel} — chọn bởi <@${interaction.user.id}>`,
      allowedMentions: { users: [interaction.user.id] },
    });
  } else {
    return;
  }

  if (
    state.code &&
    state.game &&
    state.hour &&
    state.playerId &&
    !state.dmSent
  ) {
    state.dmSent = true;
    await sendRentDmToPlayer(interaction, state);
  }
}

async function sendRentDmToPlayer(
  interaction: StringSelectMenuInteraction,
  state: RentState,
): Promise<void> {
  if (!state.playerId || !interaction.guild) return;

  // Grant the player access to the rent channel
  try {
    const channel = await interaction.guild.channels
      .fetch(state.channelId)
      .catch(() => null);
    if (channel && channel.type === ChannelType.GuildText) {
      await channel.permissionOverwrites.edit(state.playerId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      });
    }
  } catch (err) {
    console.error("Error granting player channel access:", err);
  }

  const dmEmbed = new EmbedBuilder()
    .setColor(0xff5f8a)
    .setTitle("THE LIFE EVER - Created rental ticket")
    .setDescription(
      `Hello <@${state.playerId}>, có <@${state.renterId}> đang tạo ticker để thuê bạn đấy.\n\n` +
        `**Tựa game:** ${state.gameLabel ?? "(không rõ)"}\n` +
        `**Giờ thuê:** ${state.hourLabel ?? "(không rõ)"}\n\n` +
        `Hãy vào kênh này để xem đi: <#${state.channelId}>`,
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rent_accept:${state.channelId}:${state.renterId}`)
      .setLabel("Đồng ý")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`rent_decline:${state.channelId}:${state.renterId}`)
      .setLabel("Hủy")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );

  let dmFailed = false;
  try {
    const player = await client.users.fetch(state.playerId);
    await player.send({ embeds: [dmEmbed], components: [buttons] });
  } catch (err) {
    console.error("Error DMing player:", err);
    dmFailed = true;
  }

  try {
    const channel = await interaction.guild.channels
      .fetch(state.channelId)
      .catch(() => null);
    if (channel && channel.type === ChannelType.GuildText) {
      await (channel as TextChannel).send({
        content: dmFailed
          ? `⚠️ Không gửi được DM đến <@${state.playerId}>. Có thể họ đã tắt DM từ server. Hãy ping trực tiếp họ.`
          : `📨 Đã gửi yêu cầu thuê đến <@${state.playerId}> qua DM. Đang chờ phản hồi...`,
        allowedMentions: { users: [state.playerId] },
      });
    }
  } catch (err) {
    console.error("Error notifying rent channel:", err);
  }
}

async function handleRentAccept(interaction: ButtonInteraction) {
  const segs = interaction.customId.split(":");
  const channelId = segs[1] ?? "";
  const renterId = segs[2] ?? "";

  // Remove buttons from the DM message
  try {
    await interaction.update({ components: [] });
  } catch (err) {
    console.error("Error updating DM on accept:", err);
  }

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel && channel.type === ChannelType.GuildText) {
      const state = rentStates.get(channelId);
      const gameLabel = state?.gameLabel ?? "(không rõ)";
      const hourLabel = state?.hourLabel ?? "(không rõ)";

      const acceptEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Yêu cầu thuê đã được đồng ý")
        .setDescription(
          `<@${interaction.user.id}> đã **đồng ý** yêu cầu thuê của <@${renterId}>.`,
        )
        .addFields(
          { name: "Tựa Game", value: gameLabel, inline: true },
          { name: "Giờ thuê", value: hourLabel, inline: true },
        )
        .setTimestamp();

      await (channel as TextChannel).send({
        content: `<@${renterId}> <@${interaction.user.id}>`,
        embeds: [acceptEmbed],
        allowedMentions: { users: [renterId, interaction.user.id] },
      });
    }

    await interaction.followUp({
      content: `✅ Bạn đã đồng ý. Hãy vào kênh <#${channelId}> để bắt đầu trao đổi với <@${renterId}>.`,
    });
  } catch (err) {
    console.error("Error handling rent accept:", err);
    try {
      await interaction.followUp({
        content: "Đã xảy ra lỗi khi gửi xác nhận.",
      });
    } catch {}
  }
}

async function handleRentDeclineButton(interaction: ButtonInteraction) {
  const segs = interaction.customId.split(":");
  const channelId = segs[1] ?? "";
  const renterId = segs[2] ?? "";

  const modal = new ModalBuilder()
    .setCustomId(`modal_rent_decline:${channelId}:${renterId}`)
    .setTitle("Lý do hủy yêu cầu thuê");

  const reasonInput = new TextInputBuilder()
    .setCustomId("decline_reason")
    .setLabel("Lý do")
    .setPlaceholder("Vui lòng nhập lý do hủy...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
  );

  await interaction.showModal(modal);
}

async function handleRentDeclineModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const segs = interaction.customId.split(":");
  const channelId = segs[1] ?? "";
  const renterId = segs[2] ?? "";
  const reason = interaction.fields.getTextInputValue("decline_reason");

  await interaction.deferReply();

  // Remove buttons from the original DM message
  if (interaction.message) {
    try {
      await interaction.message.edit({ components: [] });
    } catch (err) {
      console.error("Error clearing DM buttons after decline:", err);
    }
  }

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel && channel.type === ChannelType.GuildText) {
      const state = rentStates.get(channelId);
      const gameLabel = state?.gameLabel ?? "(không rõ)";
      const hourLabel = state?.hourLabel ?? "(không rõ)";

      const declineEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("❌ Yêu cầu thuê đã bị hủy")
        .setDescription(
          `<@${interaction.user.id}> đã **hủy** yêu cầu thuê của <@${renterId}>.`,
        )
        .addFields(
          { name: "Lý do", value: reason },
          { name: "Tựa Game", value: gameLabel, inline: true },
          { name: "Giờ thuê", value: hourLabel, inline: true },
        )
        .setTimestamp();

      await (channel as TextChannel).send({
        content: `<@${renterId}>`,
        embeds: [declineEmbed],
        allowedMentions: { users: [renterId] },
      });
    }

    await interaction.editReply({
      content: `Đã gửi từ chối tới kênh <#${channelId}>.`,
    });
  } catch (err) {
    console.error("Error handling rent decline:", err);
    await interaction.editReply({
      content: "Đã xảy ra lỗi khi gửi từ chối.",
    });
  }
}

async function handleCloseRentRequest(interaction: ButtonInteraction) {
  const creatorId = interaction.customId.split(":")[1] ?? "";
  const isCreator = interaction.user.id === creatorId;
  const isAdmin = memberIsAdmin(interaction.member);

  if (!isAdmin && !isCreator) {
    await interaction.reply({
      content: "Chỉ người tạo vé hoặc admin mới có thể đóng vé này.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_close_rent:${creatorId}`)
      .setLabel("Xác nhận đóng vé")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️"),
    new ButtonBuilder()
      .setCustomId("cancel_close_rent")
      .setLabel("Hủy")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content:
      "Bạn có chắc muốn **đóng và xóa vé thuê này**? Vé sẽ được ghi vào kênh LOG và xóa sau 5 giây.",
    components: [confirmRow],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfirmCloseRent(interaction: ButtonInteraction) {
  if (
    !interaction.channel ||
    interaction.channel.type !== ChannelType.GuildText ||
    !interaction.guild
  ) {
    await interaction.update({
      content: "Không thể đóng vé ở đây.",
      components: [],
    });
    return;
  }

  const creatorId = interaction.customId.split(":")[1] ?? "";
  const channel = interaction.channel;
  const guild = interaction.guild;

  await interaction.update({
    content: "Đang đóng vé thuê, kênh sẽ bị xóa sau 5 giây...",
    components: [],
  });

  // Log to LOG channel
  const logChannel = findLogChannel(guild);
  if (logChannel) {
    try {
      const logEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Vé Thuê Player đã đóng")
        .addFields(
          { name: "Kênh", value: `#${channel.name} (\`${channel.id}\`)` },
          { name: "Người tạo vé", value: `<@${creatorId}>` },
          { name: "Đóng bởi", value: `<@${interaction.user.id}>` },
        )
        .setTimestamp();
      await logChannel.send({
        embeds: [logEmbed],
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      console.error("Error sending rent log:", err);
    }
  }

  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(
            `🔒 Vé thuê được đóng bởi <@${interaction.user.id}>. Kênh sẽ bị xóa sau 5 giây.`,
          ),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("Error sending rent close notice:", err);
  }

  setTimeout(() => {
    channel.delete(`Rent ticket closed by ${interaction.user.tag}`).catch((err) => {
      console.error("Error deleting rent channel:", err);
    });
  }, 5000);
}

// =================== /playerduo ===================

function buildPlayerduoModal(
  channelId: string,
  userId: string,
  code: string,
) {
  const modal = new ModalBuilder()
    .setCustomId(
      `modal_playerduo:${channelId}:${userId}:${encodeURIComponent(code)}`,
    )
    .setTitle(`Tạo dữ liệu PlayerDuo ${code}`);

  const detailsInput = new TextInputBuilder()
    .setCustomId("pd_details")
    .setLabel("Thông tin chi tiết (markdown)")
    .setPlaceholder(
      "Mình là ...\n🌸 Mình có thể chơi ...\n→ STK: ...\nđ | 50,000/h",
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);

  const imageInput = new TextInputBuilder()
    .setCustomId("pd_image")
    .setLabel("Ảnh đính kèm (URL, nếu có)")
    .setPlaceholder("https://...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(detailsInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
  );
  return modal;
}

function normalizeCode(raw: string): string {
  const trimmed = raw.trim().replace(/^#+/, "");
  if (/^\d+$/.test(trimmed)) return `#${trimmed.padStart(2, "0")}`;
  return `#${trimmed}`;
}

async function handlePlayerduoSlash(interaction: ChatInputCommandInteraction) {
  const member = interaction.member;
  const isAdmin =
    member &&
    "permissions" in member &&
    typeof member.permissions !== "string" &&
    member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isAdmin) {
    await interaction.reply({
      content: "Chỉ admin mới có thể dùng lệnh này.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.options.getChannel("kenh", true);
  const targetUser = interaction.options.getUser("user", true);
  const code = normalizeCode(interaction.options.getString("so", true));

  await interaction.showModal(
    buildPlayerduoModal(channel.id, targetUser.id, code),
  );
}

async function handlePlayerduoModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const segments = interaction.customId.split(":");
  const channelId = segments[1] ?? "";
  const userId = segments[2] ?? "";
  const code = decodeURIComponent(segments[3] ?? "");

  if (!interaction.guild) {
    await interaction.reply({
      content: "Chỉ dùng được trong server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const channel = await guild.channels
    .fetch(channelId)
    .catch(() => null);

  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    await interaction.editReply({
      content: "Không tìm thấy kênh đã chọn hoặc kênh không hợp lệ.",
    });
    return;
  }

  const details = interaction.fields.getTextInputValue("pd_details");
  const imageRaw = interaction.fields.getTextInputValue("pd_image").trim();
  const imageUrl = imageRaw && isValidHttpUrl(imageRaw) ? imageRaw : null;

  const description = `<@${userId}>\n${details}`;

  const embed = new EmbedBuilder()
    .setColor(0xff66aa)
    .setTitle(code)
    .setDescription(description);

  if (imageUrl) {
    embed.setImage(imageUrl);
  } else if (imageRaw) {
    embed.addFields({
      name: "Ảnh đính kèm",
      value: `(URL không hợp lệ: ${imageRaw.slice(0, 200)})`,
    });
  }

  try {
    const sent = await (channel as TextChannel).send({
      embeds: [embed],
      allowedMentions: { users: [userId] },
    });

    await addEntry({
      code,
      userId,
      details,
      imageUrl,
      channelId: channel.id,
      messageId: sent.id,
      createdBy: interaction.user.id,
      createdAt: new Date().toISOString(),
    });

    await interaction.editReply({
      content: `✅ Đã tạo PlayerDuo **${code}** và gửi đến <#${channel.id}>.`,
    });
  } catch (err) {
    console.error("Error posting playerduo embed:", err);
    await interaction.editReply({
      content:
        "Không gửi được tin nhắn. Hãy đảm bảo bot có quyền **gửi tin nhắn** và **gắn embed** trong kênh đã chọn.",
    });
  }
}

// =================== /playerduo-edit & /playerduo-delete ===================

function buildPlayerduoEditModal(entry: {
  code: string;
  details: string;
  imageUrl: string | null;
}) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_playerduo_edit:${encodeURIComponent(entry.code)}`)
    .setTitle(`Chỉnh sửa PlayerDuo ${entry.code}`);

  const detailsInput = new TextInputBuilder()
    .setCustomId("pd_details")
    .setLabel("Thông tin chi tiết (markdown)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000)
    .setValue(entry.details.slice(0, 2000));

  const imageInput = new TextInputBuilder()
    .setCustomId("pd_image")
    .setLabel("Ảnh đính kèm (URL, nếu có)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setValue(entry.imageUrl ?? "");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(detailsInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
  );
  return modal;
}

async function handlePlayerduoEditSlash(
  interaction: ChatInputCommandInteraction,
) {
  const member = interaction.member;
  const isAdmin =
    member &&
    "permissions" in member &&
    typeof member.permissions !== "string" &&
    member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdmin) {
    await interaction.reply({
      content: "Chỉ admin mới có thể dùng lệnh này.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const code = normalizeCode(interaction.options.getString("so", true));
  const entry = await getEntry(code);
  if (!entry) {
    await interaction.reply({
      content: `Không tìm thấy PlayerDuo có mã **${code}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.showModal(buildPlayerduoEditModal(entry));
}

async function handlePlayerduoEditModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const code = decodeURIComponent(
    interaction.customId.split(":")[1] ?? "",
  );

  if (!interaction.guild) {
    await interaction.reply({
      content: "Chỉ dùng được trong server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const entry = await getEntry(code);
  if (!entry) {
    await interaction.editReply({
      content: `Không còn dữ liệu cho mã **${code}**.`,
    });
    return;
  }

  const details = interaction.fields.getTextInputValue("pd_details");
  const imageRaw = interaction.fields.getTextInputValue("pd_image").trim();
  const imageUrl = imageRaw && isValidHttpUrl(imageRaw) ? imageRaw : null;

  const embed = new EmbedBuilder()
    .setColor(0xff66aa)
    .setTitle(entry.code)
    .setDescription(`<@${entry.userId}>\n${details}`);

  if (imageUrl) {
    embed.setImage(imageUrl);
  } else if (imageRaw) {
    embed.addFields({
      name: "Ảnh đính kèm",
      value: `(URL không hợp lệ: ${imageRaw.slice(0, 200)})`,
    });
  }

  let messageEditFailed = false;
  try {
    const channel = await interaction.guild.channels
      .fetch(entry.channelId)
      .catch(() => null);
    if (
      channel &&
      (channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement)
    ) {
      const msg = await (channel as TextChannel).messages
        .fetch(entry.messageId)
        .catch(() => null);
      if (msg) {
        await msg.edit({
          embeds: [embed],
          allowedMentions: { users: [entry.userId] },
        });
      } else {
        messageEditFailed = true;
      }
    } else {
      messageEditFailed = true;
    }
  } catch (err) {
    console.error("Error editing playerduo message:", err);
    messageEditFailed = true;
  }

  await addEntry({
    ...entry,
    details,
    imageUrl,
  });

  await interaction.editReply({
    content:
      `✅ Đã cập nhật PlayerDuo **${entry.code}**.` +
      (messageEditFailed
        ? `\n⚠️ Không sửa được tin nhắn cũ trong <#${entry.channelId}> (có thể đã bị xóa hoặc bot không có quyền). Dữ liệu trong database vẫn được cập nhật.`
        : `\nĐã sửa tin nhắn embed trong <#${entry.channelId}>.`),
  });
}

async function handlePlayerduoDeleteSlash(
  interaction: ChatInputCommandInteraction,
) {
  const member = interaction.member;
  const isAdmin =
    member &&
    "permissions" in member &&
    typeof member.permissions !== "string" &&
    member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdmin) {
    await interaction.reply({
      content: "Chỉ admin mới có thể dùng lệnh này.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const code = normalizeCode(interaction.options.getString("so", true));
  const entry = await getEntry(code);
  if (!entry) {
    await interaction.reply({
      content: `Không tìm thấy PlayerDuo có mã **${code}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pd_delete_confirm:${encodeURIComponent(entry.code)}`)
      .setLabel(`Xóa ${entry.code}`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️"),
    new ButtonBuilder()
      .setCustomId("pd_delete_cancel")
      .setLabel("Hủy")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content:
      `Bạn có chắc muốn **xóa PlayerDuo ${entry.code}** (user <@${entry.userId}>)?\n` +
      `Tin nhắn embed trong <#${entry.channelId}> cũng sẽ bị xóa.`,
    components: [confirmRow],
    allowedMentions: { parse: [] },
  });
}

async function handlePlayerduoDeleteConfirm(interaction: ButtonInteraction) {
  const code = decodeURIComponent(
    interaction.customId.split(":")[1] ?? "",
  );

  if (!interaction.guild) {
    await interaction.update({
      content: "Chỉ dùng được trong server.",
      components: [],
    });
    return;
  }

  const entry = await getEntry(code);
  if (!entry) {
    await interaction.update({
      content: `Không còn dữ liệu cho mã **${code}**.`,
      components: [],
    });
    return;
  }

  let messageDeleteFailed = false;
  try {
    const channel = await interaction.guild.channels
      .fetch(entry.channelId)
      .catch(() => null);
    if (
      channel &&
      (channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement)
    ) {
      const msg = await (channel as TextChannel).messages
        .fetch(entry.messageId)
        .catch(() => null);
      if (msg) {
        await msg.delete();
      } else {
        messageDeleteFailed = true;
      }
    } else {
      messageDeleteFailed = true;
    }
  } catch (err) {
    console.error("Error deleting playerduo message:", err);
    messageDeleteFailed = true;
  }

  await deleteEntry(code);

  await interaction.update({
    content:
      `✅ Đã xóa PlayerDuo **${code}**.` +
      (messageDeleteFailed
        ? `\n⚠️ Không xóa được tin nhắn cũ (có thể đã bị xóa từ trước hoặc bot không có quyền). Dữ liệu trong database đã được xóa.`
        : ""),
    components: [],
  });
}

async function handlePlayerduoResendSlash(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!memberIsAdmin(interaction.member)) {
    await interaction.reply({
      content: "Chỉ admin mới có thể dùng lệnh này.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.guild) {
    await interaction.reply({
      content: "Chỉ dùng được trong server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetChannel = interaction.options.getChannel("kenh", true);
  const code = normalizeCode(interaction.options.getString("so", true));

  if (
    targetChannel.type !== ChannelType.GuildText &&
    targetChannel.type !== ChannelType.GuildAnnouncement
  ) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: "Chỉ chọn được kênh Text hoặc Announcement.",
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const entry = await getEntry(code);
  if (!entry) {
    await interaction.editReply({
      content: `❌ Không tìm thấy dữ liệu PlayerDuo với mã **${code}**.`,
    });
    return;
  }

  const channel = await interaction.guild.channels
    .fetch(targetChannel.id)
    .catch(() => null);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    await interaction.editReply({
      content: "Không truy cập được kênh đã chọn.",
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xff66aa)
    .setTitle(entry.code)
    .setDescription(`<@${entry.userId}>\n${entry.details}`);
  if (entry.imageUrl) embed.setImage(entry.imageUrl);

  try {
    await (channel as TextChannel).send({
      embeds: [embed],
      allowedMentions: { users: [entry.userId] },
    });
    await interaction.editReply({
      content: `✅ Đã gửi lại PlayerDuo **${entry.code}** vào <#${channel.id}>.`,
    });
  } catch (err) {
    console.error("Error resending playerduo embed:", err);
    await interaction.editReply({
      content:
        "❌ Không gửi được. Hãy đảm bảo bot có quyền **gửi tin nhắn** và **gắn embed** trong kênh đã chọn.",
    });
  }
}

async function handlePlayerduoAutocomplete(
  interaction: AutocompleteInteraction,
) {
  const focused = interaction.options.getFocused().toString().toLowerCase();
  const entries = await getAllEntries();
  const filtered = entries
    .filter((e) => e.code.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((e) => ({ name: e.code, value: e.code }));
  await interaction.respond(filtered);
}

// =================== /panel — Ticker hỗ trợ ===================

async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName === "panel") {
    await interaction.reply({
      embeds: [buildPanelEmbed()],
      components: [buildPanelButtons()],
    });
    return;
  }

  if (interaction.commandName === "rent-panel") {
    if (!memberIsAdmin(interaction.member)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "❌ Lệnh này chỉ dành cho admin.",
      });
      return;
    }
    const targetChannel = interaction.options.getChannel("kenh", true);
    if (
      targetChannel.type !== ChannelType.GuildText &&
      targetChannel.type !== ChannelType.GuildAnnouncement
    ) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: "Chỉ chọn được kênh Text hoặc Announcement.",
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const channel = await interaction.guild!.channels.fetch(targetChannel.id);
      if (
        !channel ||
        (channel.type !== ChannelType.GuildText &&
          channel.type !== ChannelType.GuildAnnouncement)
      ) {
        await interaction.editReply({
          content: "Không truy cập được kênh đã chọn.",
        });
        return;
      }
      await (channel as TextChannel).send({
        embeds: [buildRentPanelEmbed()],
        components: [buildRentPanelButtons()],
      });
      await interaction.editReply({
        content: `✅ Đã đăng panel Thuê Player vào <#${targetChannel.id}>.`,
      });
    } catch (err) {
      console.error("Error posting rent panel:", err);
      await interaction.editReply({
        content:
          "❌ Không gửi được panel vào kênh đã chọn. Kiểm tra quyền của bot trong kênh đó.",
      });
    }
    return;
  }

  if (interaction.commandName === "playerduo") {
    await handlePlayerduoSlash(interaction);
    return;
  }

  if (interaction.commandName === "playerduo-edit") {
    await handlePlayerduoEditSlash(interaction);
    return;
  }

  if (interaction.commandName === "playerduo-resend") {
    await handlePlayerduoResendSlash(interaction);
    return;
  }
  if (interaction.commandName === "playerduo-delete") {
    await handlePlayerduoDeleteSlash(interaction);
    return;
  }
}

async function handleButton(interaction: ButtonInteraction) {
  if (interaction.customId === "open_modal_ticker") {
    await interaction.showModal(buildTickerModal());
    return;
  }

  if (interaction.customId === "rent_guide") {
    await handleRentGuide(interaction);
    return;
  }

  if (interaction.customId === "rent_open") {
    await handleRentOpen(interaction);
    return;
  }

  if (interaction.customId === "rent_complain") {
    await interaction.showModal(buildTickerModal());
    return;
  }

  if (interaction.customId.startsWith("rent_accept:")) {
    await handleRentAccept(interaction);
    return;
  }

  if (interaction.customId.startsWith("rent_decline:")) {
    await handleRentDeclineButton(interaction);
    return;
  }

  if (interaction.customId.startsWith("close_rent:")) {
    await handleCloseRentRequest(interaction);
    return;
  }

  if (interaction.customId.startsWith("confirm_close_rent:")) {
    await handleConfirmCloseRent(interaction);
    return;
  }

  if (interaction.customId === "cancel_close_rent") {
    await interaction.update({
      content: "Đã hủy đóng vé thuê.",
      components: [],
    });
    return;
  }

  if (interaction.customId.startsWith("close_ticket:")) {
    await handleCloseTicketRequest(interaction);
    return;
  }

  if (interaction.customId.startsWith("confirm_close:")) {
    await handleConfirmClose(interaction);
    return;
  }

  if (interaction.customId === "cancel_close") {
    await interaction.update({
      content: "Đã hủy đóng ticker.",
      components: [],
    });
    return;
  }

  if (interaction.customId.startsWith("pd_delete_confirm:")) {
    await handlePlayerduoDeleteConfirm(interaction);
    return;
  }

  if (interaction.customId === "pd_delete_cancel") {
    await interaction.update({
      content: "Đã hủy xóa.",
      components: [],
    });
    return;
  }
}

async function handleCloseTicketRequest(interaction: ButtonInteraction) {
  const creatorId = interaction.customId.split(":")[1] ?? "";
  const isAdmin = memberIsAdmin(interaction.member);
  const isCreator = interaction.user.id === creatorId;

  if (!isAdmin && !isCreator) {
    await interaction.reply({
      content: "Chỉ người tạo ticker hoặc admin mới có thể đóng.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_close:${creatorId}`)
      .setLabel("Xác nhận đóng")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️"),
    new ButtonBuilder()
      .setCustomId("cancel_close")
      .setLabel("Hủy")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content:
      "Bạn có chắc muốn **đóng và xóa kênh ticker này**? Hành động không thể hoàn tác.",
    components: [confirmRow],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleConfirmClose(interaction: ButtonInteraction) {
  if (
    !interaction.channel ||
    interaction.channel.type !== ChannelType.GuildText
  ) {
    await interaction.update({
      content: "Không thể đóng ticker ở đây.",
      components: [],
    });
    return;
  }

  await interaction.update({
    content: "Đang đóng ticker, kênh sẽ bị xóa sau 5 giây...",
    components: [],
  });

  const channel = interaction.channel;

  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription(
            `🔒 Ticker được đóng bởi <@${interaction.user.id}>. Kênh sẽ bị xóa sau 5 giây.`,
          ),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("Error sending close notice:", err);
  }

  setTimeout(() => {
    channel.delete(`Closed by ${interaction.user.tag}`).catch((err) => {
      console.error("Error deleting ticket channel:", err);
    });
  }, 5000);
}

async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  if (interaction.customId.startsWith("modal_playerduo:")) {
    await handlePlayerduoModalSubmit(interaction);
    return;
  }

  if (interaction.customId.startsWith("modal_playerduo_edit:")) {
    await handlePlayerduoEditModalSubmit(interaction);
    return;
  }

  if (interaction.customId.startsWith("modal_rent_decline:")) {
    await handleRentDeclineModalSubmit(interaction);
    return;
  }

  if (interaction.customId !== "modal_ticker") return;

  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: "Lệnh này chỉ dùng được trong server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const user = interaction.user;
  const subject = interaction.fields.getTextInputValue("ticker_subject");
  const details = interaction.fields.getTextInputValue("ticker_details");
  const imageRaw = interaction.fields.getTextInputValue("ticker_image").trim();
  const imageUrl = imageRaw && isValidHttpUrl(imageRaw) ? imageRaw : null;

  try {
    const category = await findOrCreateCategory(guild, TICKET_CATEGORY_NAME);

    const username =
      "displayName" in interaction.member &&
      typeof interaction.member.displayName === "string"
        ? interaction.member.displayName
        : user.username;

    const channelName = `ticker-${sanitizeChannelName(username)}-${vnTimestamp()}`;
    const overwrites = buildPrivateOverwrites(guild, user.id);

    const adminRoles = guild.roles.cache.filter((role) =>
      role.permissions.has(PermissionFlagsBits.Administrator),
    );

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
      topic: `Ticker của ${user.tag} - ${subject}`,
    });

    const ticketEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`🎫 Ticker: ${subject}`)
      .addFields(
        { name: "Người tạo", value: `<@${user.id}> (${user.tag})` },
        { name: "Tiêu đề", value: subject },
        { name: "Nội dung chi tiết", value: details },
      )
      .setFooter({ text: `User ID: ${user.id}` })
      .setTimestamp();

    if (imageUrl) {
      ticketEmbed.setImage(imageUrl);
      ticketEmbed.addFields({ name: "Ảnh đính kèm (URL)", value: imageUrl });
    } else if (imageRaw) {
      ticketEmbed.addFields({
        name: "Ảnh đính kèm",
        value: `(URL không hợp lệ: ${imageRaw.slice(0, 200)})`,
      });
    }

    const guideEmbed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setDescription(
        "📎 **Cần đính kèm thêm ảnh?** Dán trực tiếp ảnh từ clipboard (Ctrl+V), " +
          "kéo-thả file, hoặc bấm dấu `+` bên trái ô chat để chọn ảnh từ máy.",
      );

    const adminMentions = adminRoles.map((r) => `<@&${r.id}>`).join(" ");
    const mentionContent = `<@${user.id}> ${adminMentions}`.trim();

    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_ticket:${user.id}`)
        .setLabel("Đóng ticker")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒"),
    );

    await channel.send({
      content: mentionContent || `<@${user.id}>`,
      embeds: [ticketEmbed, guideEmbed],
      components: [closeRow],
      allowedMentions: {
        users: [user.id],
        roles: adminRoles.map((r) => r.id),
      },
    });

    const dmEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Ticker của bạn đã được tạo")
      .setDescription(
        `Kênh hỗ trợ: <#${channel.id}> (trong server **${guild.name}**)\n\n` +
          "📎 Vào kênh trên và **dán/đính kèm ảnh** trực tiếp nếu cần thêm.",
      )
      .addFields(
        { name: "Tiêu đề", value: subject },
        { name: "Nội dung chi tiết", value: details },
      )
      .setTimestamp();

    if (imageUrl) {
      dmEmbed.setImage(imageUrl);
      dmEmbed.addFields({ name: "Ảnh đính kèm (URL)", value: imageUrl });
    }

    let dmFailed = false;
    try {
      await user.send({ embeds: [dmEmbed] });
    } catch {
      dmFailed = true;
    }

    await interaction.editReply({
      content:
        `Đã tạo ticker thành công: <#${channel.id}>` +
        (dmFailed
          ? "\n⚠️ Không gửi được DM cho bạn (có thể bạn đã tắt DM từ server)."
          : ""),
    });
  } catch (err) {
    console.error("Error creating ticker:", err);
    await interaction.editReply({
      content:
        "Không thể tạo ticker. Hãy đảm bảo bot có quyền **Manage Channels** trong server.",
    });
  }
}

// =================== Bootstrap ===================

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot online! Logged in as ${readyClient.user.tag}`);
  console.log(`Bot ID: ${readyClient.user.id}`);
  console.log(`Serving ${readyClient.guilds.cache.size} guild(s)`);
  await registerCommands(readyClient.user.id);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isAutocomplete()) {
      if (
        interaction.commandName === "playerduo-edit" ||
        interaction.commandName === "playerduo-delete" ||
        interaction.commandName === "playerduo-resend"
      ) {
        await handlePlayerduoAutocomplete(interaction);
      }
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleRentSelect(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
  } catch (err) {
    console.error("Error handling interaction:", err);
    if (interaction.isRepliable() && !interaction.replied) {
      try {
        await interaction.reply({
          content: "Đã xảy ra lỗi khi xử lý yêu cầu.",
          flags: MessageFlags.Ephemeral,
        });
      } catch {}
    }
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down...`);
  try {
    await client.destroy();
  } catch (err) {
    console.error("Error during shutdown:", err);
  }
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Tiny HTTP keepalive server so the deployment platform can health-check the bot.
const healthPort = Number(process.env.PORT ?? 8082);
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(client.isReady() ? "ok" : "starting");
}).listen(healthPort, "0.0.0.0", () => {
  console.log(`Health check server listening on port ${healthPort}`);
});

if (token) {
  client.login(token).catch((err) => {
    console.error("Failed to login:", err);
    process.exit(1);
  });
}
