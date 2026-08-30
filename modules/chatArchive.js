function archiveLiveMessage(client, message) {
  if (!message.guild || !message.channel) return;
  if (message.system) return;
  if (message.channel.nsfw) return;

  const skipChannels = client.getSkipChannels(message.guild);
  if (skipChannels.includes(message.channel.id)) return;

  const settings = client.getSettings(message.guild);
  const prefix = settings.prefix;
  if (prefix && message.content.startsWith(prefix)) return;

  const member = message.member || message.guild.members.cache.get(message.author.id);
  const authorName =
    member?.displayName || message.author.globalName || message.author.username || null;

  client.getDatabase(message.guild.id).insertChatMessage({
    id: message.id,
    channel_id: message.channel.id,
    author_id: message.author.id,
    author_name: authorName,
    content: message.content || "",
    created_at: message.createdTimestamp,
    is_bot: message.author.bot ? 1 : 0,
  });
}

module.exports = { archiveLiveMessage };
