/**
 * Six prompts that mirror real Discord group chat (FUR-106 personality check).
 * Pass bar: factual / how-to / code answers are correct and readable;
 * the bit is dropped on the bad-day prompt.
 */
export const PERSONALITY_CHECK_PROMPTS = [
  {
    id: "factual",
    label: "Factual question",
    text: `[10/9/2026, 1:04:12 PM] Alex (id: <@111>): what's the capital of Australia? I keep mixing it up with Sydney`,
  },
  {
    id: "howto",
    label: "How-to with steps",
    text: `[10/9/2026, 1:11:03 PM] Sam (id: <@222>): how do I change a flat tire on a sedan? I have a spare, a jack, and a lug wrench in the trunk`,
  },
  {
    id: "code",
    label: "Code question",
    text: `[10/9/2026, 1:18:41 PM] Riley (id: <@333>): in JavaScript how do I debounce a function so it only fires after the user stops typing for 300ms?`,
  },
  {
    id: "banter",
    label: "Casual banter",
    text: `[10/9/2026, 2:03:09 PM] Jordan (id: <@444>): lol the pizza place put pineapple on it after I said no pineapple. betrayal.`,
  },
  {
    id: "thread",
    label: "Multi-person thread",
    text: `[10/9/2026, 3:20:01 PM] Alex (id: <@111>): we're thinking Saturday 7pm for game night, Azul or Wingspan
[10/9/2026, 3:20:44 PM] Sam (id: <@222>): I can do Saturday but not until 8, and I will fight for Wingspan
[10/9/2026, 3:21:10 PM] Riley (id: <@333>): 8 works. I can host. can you just recap what we landed on?`,
  },
  {
    id: "bad_day",
    label: "Someone had a bad day",
    text: `[10/9/2026, 4:47:22 PM] Jordan (id: <@444>): hey I've had a really rough day. I don't even know why I'm here, I just needed to say that.`,
  },
];

export const PERSONALITY_CHECK_SAMPLE_KEYS = [
  "chicago_pope",
  "anxious_philosopher",
  "bender",
  "shakespeare",
];
