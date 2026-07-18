import { classifyUnknownVideos } from "./classifier.js";
import { classificationSettings } from "./classification-settings.js";
import { loadEnvironment } from "./env.js";
import { readHostRegistry, registerDiscoveredHosts } from "./host-registry.js";
import { applyHosts, seedAutomaticHosts } from "./hosts.js";
import { autoHostsPath, readJson, videosPath, writeJson } from "./storage.js";

await loadEnvironment();
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY. Add it to .env or the environment.");
  process.exitCode = 1;
} else {
  const data = await readJson(videosPath, null);
  if (!data) {
    console.error("No video data found. Run npm run collect first.");
    process.exitCode = 1;
  } else {
    const automatic = seedAutomaticHosts(data.videos, await readJson(autoHostsPath, {}));
    const hosts = await readHostRegistry();
    const force = process.argv.includes("--all");
    const settings = classificationSettings(process.argv.slice(2));
    data.videos = applyHosts(data.videos, automatic);
    await writeJson(videosPath, data);
    const attemptedVideoIds = new Set();
    let batch = 0;
    let result;
    console.log(`Processing queued videos in batches of ${settings.batchSize} at ${settings.requestsPerMinute} requests/minute.`);

    do {
      batch += 1;
      console.log(`\nBatch ${batch}`);
      result = await classifyUnknownVideos(data.videos, automatic, apiKey, {
        ...settings,
        hosts,
        force,
        attemptedVideoIds,
        onProgress: ({ current, total, video }) => console.log(`[${current}/${total}] ${video.title}`),
        onDelay: (milliseconds) => console.log(`Waiting ${Math.ceil(milliseconds / 1000)}s for the request limit...`),
        onLimit: (error) => console.log(`${error.message}. Resume after the daily quota resets.`),
        onError: (error, video) => console.error(`Could not classify ${video.id}: ${error.message}`)
      });
      await registerDiscoveredHosts(hosts, automatic);
      data.videos = applyHosts(data.videos, automatic);
      data.classifiedAt = new Date().toISOString();
      await writeJson(videosPath, data);
      const unknown = data.videos.filter((video) => !video.host).length;
      console.log(`Batch ${batch} complete. ${result.remaining} videos remain queued; ${unknown} are not yet identified.`);
    } while (result.available > 0 && result.attempted > 0 && !result.limitReached);

    if (result.remaining === 0) console.log("All videos have a cached Gemini result.");
    else if (!result.limitReached) console.log("Remaining failed videos can be retried on the next run.");
  }
}
