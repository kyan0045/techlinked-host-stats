import { classifyVideoHost } from "./gemini.js";
import { autoHostsPath, writeJson } from "./storage.js";
import { createGeminiLimiter } from "./quota.js";

function isCompleted(result) {
  return result != null && !result.reason?.startsWith("Classification failed:");
}

export async function classifyUnknownVideos(videos, automatic, apiKey, options = {}) {
  const force = options.force || false;
  const batchSize = options.batchSize || 10;
  const attemptedVideoIds = options.attemptedVideoIds || new Set();
  const candidates = videos.filter((video) => (
    !attemptedVideoIds.has(video.id)
    && (force || !isCompleted(automatic[video.id]))
  )).slice(0, batchSize);
  const beforeRequest = options.beforeRequest || await createGeminiLimiter({
    requestsPerMinute: options.requestsPerMinute || 12,
    dailyLimit: options.dailyLimit || 450,
    onDelay: options.onDelay
  });
  const classify = options.classifyVideoHost || classifyVideoHost;
  const cachePath = options.autoHostsPath || autoHostsPath;
  let attempted = 0;
  let limitReached = false;

  for (let index = 0; index < candidates.length; index += 1) {
    const video = candidates[index];
    attemptedVideoIds.add(video.id);
    attempted += 1;
    options.onProgress?.({ current: index + 1, total: candidates.length, video });
    try {
      automatic[video.id] = {
        ...await classify(video, apiKey, { ...options, beforeRequest }),
        classifiedAt: new Date().toISOString()
      };
    } catch (error) {
      if (error.code === "GEMINI_DAILY_LIMIT") {
        limitReached = true;
        options.onLimit?.(error);
        break;
      }
      options.onError?.(error, video);
    }
    await writeJson(cachePath, automatic);
  }

  const remainsQueued = (video) => force
    ? !attemptedVideoIds.has(video.id)
    : !isCompleted(automatic[video.id]);
  const remaining = videos.filter(remainsQueued).length;
  const available = videos.filter((video) => remainsQueued(video) && !attemptedVideoIds.has(video.id)).length;
  return { automatic, attempted, remaining, available, limitReached };
}
