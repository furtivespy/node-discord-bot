const SEARCH_TYPES = ["hot", "top", "rising"];
const SEARCH_LIMIT = 75;
const MAX_RETRIES = 8;
const USER_AGENT =
  "BenderBot/1.0 (https://github.com/furtivespy/node-discord-bot)";

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function isImageUrl(url, includeGif = true) {
  if (!url || url.includes(".gifv")) return false;
  if (
    url.includes(".jpg") ||
    url.includes(".png") ||
    url.includes(".jpeg")
  ) {
    return true;
  }
  return includeGif && url.includes(".gif");
}

function formatPost(post, type) {
  return {
    id: post.id ?? null,
    type,
    title: post.title ?? null,
    postLink: post.id ? `https://redd.it/${post.id}` : null,
    image: post.url ?? null,
    thumbnail: post.thumbnail ?? null,
    subreddit: post.subreddit ?? null,
    NSFW: post.over_18 ?? null,
    spoiler: post.spoiler ?? null,
    createdUtc: post.created_utc ?? null,
    upvotes: post.ups ?? null,
    upvoteRatio: post.upvote_ratio ?? null,
  };
}

async function fetchListing(subreddit) {
  const sort = pick(SEARCH_TYPES);
  const url =
    "https://api.reddit.com/r/" +
    encodeURIComponent(subreddit) +
    "/" +
    sort +
    "?limit=" +
    SEARCH_LIMIT;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Reddit ${response.status} for r/${subreddit}/${sort}`);
  }
  const body = await response.json();
  if (!body?.data?.children) {
    throw new Error(`Unexpected Reddit payload for r/${subreddit}/${sort}`);
  }
  return body;
}

/**
 * Drop-in replacement for the subset of reddit-image-fetcher used by /dicks.
 * Avoids the stale axios 0.21.x transitive dependency.
 */
async function fetchImages(options = {}) {
  const type = options.type || "custom";
  const total = options.total == null ? 1 : Number(options.total);
  const allowNSFW = options.allowNSFW !== false;
  const subreddits = Array.isArray(options.subreddit)
    ? options.subreddit.filter(Boolean)
    : options.subreddit
      ? [options.subreddit]
      : [];

  if (!subreddits.length || total < 1) return [];

  const includeGif = type !== "wallpaper";
  const collected = [];

  for (let attempt = 0; attempt < MAX_RETRIES && collected.length < total; attempt++) {
    try {
      const listing = await fetchListing(pick(subreddits));
      for (const child of listing.data.children) {
        const post = child && child.data;
        if (!post || !isImageUrl(post.url, includeGif)) continue;
        if (post.over_18 && !allowNSFW) continue;
        collected.push(formatPost(post, type));
      }
    } catch (_err) {
      // Try another subreddit / sort. Empty results are handled by the caller.
    }
  }

  if (!collected.length) return [];
  if (total === 1) return [pick(collected)];
  const shuffled = collected.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, total);
}

export { fetchImages as fetch, isImageUrl };
