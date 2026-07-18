import { CHANNEL_HANDLE, matureReportRange, reportRange } from "./config.js";
import { classifyUnknownVideos } from "./classifier.js";
import { classificationSettings } from "./classification-settings.js";
import { loadEnvironment } from "./env.js";
import { readHostRegistry, registerDiscoveredHosts } from "./host-registry.js";
import { applyHosts, seedAutomaticHosts } from "./hosts.js";
import { autoHostsPath, readJson, videosPath, writeJson } from "./storage.js";
import { getChannel, getVideoIds, getVideos, isShortVideo, normalizeVideo } from "./youtube.js";

await loadEnvironment();
const apiKey = process.env.YOUTUBE_API_KEY;
if (!apiKey) {
  console.error("Missing YOUTUBE_API_KEY. Add it to .env or the environment.");
  process.exitCode = 1;
} else {
  try {
    const range = matureReportRange(reportRange());
    console.log(`Finding @${CHANNEL_HANDLE}...`);
    const channel = await getChannel(CHANNEL_HANDLE, apiKey);
    const playlistId = channel.contentDetails.relatedPlaylists.uploads;
    console.log(`Collecting uploads from ${range.start.slice(0, 10)} through ${new Date(new Date(range.endExclusive).getTime() - 1).toISOString().slice(0, 10)}.`);
    console.log(`Only videos at least ${range.minimumVideoAgeDays} days old are included.`);
    const ids = await getVideoIds(playlistId, range.start, range.endExclusive, apiKey);
    const rawVideos = await getVideos(ids, apiKey);
    const existing = await readJson(videosPath, { videos: [] });
    const automatic = seedAutomaticHosts(existing.videos, await readJson(autoHostsPath, {}));
    const hosts = await readHostRegistry();
    const allVideos = rawVideos.map(normalizeVideo);
    const normalizedVideos = allVideos.filter((video) => !isShortVideo(video));
    console.log(`Excluded ${allVideos.length - normalizedVideos.length} Shorts.`);
    if (process.env.GEMINI_API_KEY) {
      const settings = classificationSettings();
      console.log(`Automatically identifying up to ${settings.batchSize} hosts at ${settings.requestsPerMinute} requests/minute...`);
      await classifyUnknownVideos(normalizedVideos, automatic, process.env.GEMINI_API_KEY, {
        ...settings,
        hosts,
        onProgress: ({ current, total, video }) => console.log(`[${current}/${total}] ${video.title}`),
        onDelay: (milliseconds) => console.log(`Waiting ${Math.ceil(milliseconds / 1000)}s for the request limit...`),
        onLimit: (error) => console.log(`${error.message}. Classification will resume on a later run.`),
        onError: (error, video) => console.error(`Could not classify ${video.id}: ${error.message}`)
      });
    } else {
      console.log("GEMINI_API_KEY is not set; skipping automatic host detection.");
    }
    await registerDiscoveredHosts(hosts, automatic);
    const videos = applyHosts(normalizedVideos, automatic);
    const output = {
      channel: {
        id: channel.id,
        title: channel.snippet.title,
        handle: CHANNEL_HANDLE,
        avatar: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url || null
      },
      range: {
        start: range.start,
        endExclusive: range.endExclusive,
        minimumVideoAgeDays: range.minimumVideoAgeDays
      },
      collectedAt: new Date().toISOString(),
      videos
    };
    await writeJson(videosPath, output);
    console.log(`Saved ${videos.length} videos to data/videos.json.`);
    const unknown = videos.filter((video) => !video.host).length;
    console.log(`${unknown} video${unknown === 1 ? "" : "s"} are not yet identified.`);
  } catch (error) {
    console.error(`Collection failed: ${error.message}`);
    process.exitCode = 1;
  }
}
