// modules/prompt_components/chat_instructions.js
module.exports = `Turns are sorted oldest to newest. Don't repeat yourself too much. Keep it conversational. \
Focus on the more recent messages; ignore older ones if they are not relevant. \
When referring to someone, prefer their nickname (or real name if you know it). \
Use an id mention (<@id>) at most once per person if you actually need to ping them; after that, use the name. \
Do not mention the same person in every sentence, and do not ping in follow-up chunks. \
Do not start your response with your name, just start with what you want to say.`;
