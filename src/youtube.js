const API_ROOT = "https://www.googleapis.com/youtube/v3";

async function request(resource, parameters, apiKey) {
  const url = new URL(`${API_ROOT}/${resource}`);
  url.search = new URLSearchParams({ ...parameters, key: apiKey });
  const response = await fetch(url);
  const body = await response.json();

  if (!response.ok) {
    const message = body.error?.message || `YouTube API returned ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export async function getChannel(handle, apiKey) {
  const result = await request("channels", {
    part: "snippet,contentDetails",
    forHandle: handle,
    maxResults: "1"
  }, apiKey);
  const channel = result.items?.[0];
  if (!channel) throw new Error(`YouTube channel @${handle} was not found`);
  return channel;
}

export async function getVideoIds(playlistId, startDate, endDateExclusive, apiKey) {
  const ids = [];
  let pageToken;
  let reachedStart = false;

  do {
    const result = await request("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {})
    }, apiKey);

    for (const item of result.items || []) {
      const publishedAt = item.contentDetails.videoPublishedAt;
      if (publishedAt < startDate) {
        reachedStart = true;
        break;
      }
      if (publishedAt < endDateExclusive) ids.push(item.contentDetails.videoId);
    }
    pageToken = result.nextPageToken;
  } while (pageToken && !reachedStart);

  return ids;
}

export async function getVideos(ids, apiKey) {
  const videos = [];
  for (let index = 0; index < ids.length; index += 50) {
    const result = await request("videos", {
      part: "snippet,statistics,contentDetails",
      id: ids.slice(index, index + 50).join(","),
      maxResults: "50"
    }, apiKey);
    videos.push(...(result.items || []));
  }
  return videos;
}

export function durationSeconds(duration) {
  const match = duration?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

export function isShortVideo(video) {
  const seconds = durationSeconds(video.duration);
  return seconds != null && seconds <= 180;
}

export function normalizeVideo(video) {
  const thumbnail = video.snippet.thumbnails?.medium
    || video.snippet.thumbnails?.high
    || video.snippet.thumbnails?.default;
  return {
    id: video.id,
    title: video.snippet.title,
    publishedAt: video.snippet.publishedAt,
    thumbnail: thumbnail?.url || `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`,
    duration: video.contentDetails.duration,
    views: Number(video.statistics.viewCount || 0),
    likes: video.statistics.likeCount == null ? null : Number(video.statistics.likeCount)
  };
}
