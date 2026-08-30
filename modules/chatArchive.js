function getAuthorName(message) {
  const member = message.member || message.guild?.members.cache.get(message.author.id);
  return member?.displayName || message.author.globalName || message.author.username || null;
}

function isPrefixCommand(client, message) {
  if (!message.guild) return false;
  const prefix = client.getSettings(message.guild).prefix;
  return Boolean(prefix && message.content.startsWith(prefix));
}

function isImageAttachment(attachment) {
  const name = attachment?.name || "";
  if (attachment?.contentType && attachment.contentType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

function imagePlaceholders(message) {
  if (!message.attachments?.size) return "";
  const parts = [];
  for (const attachment of message.attachments.values()) {
    if (!isImageAttachment(attachment)) continue;
    parts.push(`[image: ${attachment.name || "image"}]`);
  }
  return parts.join(" ");
}

function liveMessageText(message) {
  const placeholders = imagePlaceholders(message);
  const content = message.content || "";
  if (content && placeholders) return `${content} ${placeholders}`;
  return content || placeholders;
}

function isArchivableMessage(client, message, { channelAlreadyChecked = false } = {}) {
  if (!message.guild || !message.channel) return false;
  if (message.system) return false;
  if (!channelAlreadyChecked) {
    if (message.channel.nsfw || message.channel.parent?.nsfw) return false;
    const skipChannels = client.getSkipChannels(message.guild);
    if (skipChannels.includes(message.channel.id)) return false;
    if (message.channel.parentId && skipChannels.includes(message.channel.parentId)) return false;
  }
  if (isPrefixCommand(client, message)) return false;
  return true;
}

function toChatMessageRow(message, { includeAttachments = false } = {}) {
  return {
    id: message.id,
    channel_id: message.channel.id,
    author_id: message.author.id,
    author_name: getAuthorName(message),
    content: includeAttachments ? liveMessageText(message) : (message.content || ""),
    created_at: message.createdTimestamp,
    is_bot: message.author.bot ? 1 : 0,
  };
}

function archiveLiveMessage(client, message) {
  if (!isArchivableMessage(client, message)) return;
  client.getDatabase(message.guild.id).insertChatMessage(toChatMessageRow(message, { includeAttachments: true }));
}

module.exports = {
  archiveLiveMessage,
  imagePlaceholders,
  isArchivableMessage,
  isImageAttachment,
  isPrefixCommand,
  liveMessageText,
  toChatMessageRow,
};
