export function applyHosts(videos, automatic = {}) {
  return videos.map((video) => {
    const automaticResult = automatic[video.id];
    return {
      ...video,
      host: automaticResult?.host || null,
      hostSource: automaticResult ? "automatic" : null,
      hostConfidence: automaticResult?.confidence || null
    };
  });
}

export function seedAutomaticHosts(videos, automatic = {}) {
  for (const video of videos || []) {
    if (!video.host || automatic[video.id]) continue;
    automatic[video.id] = {
      host: video.host,
      fullName: video.host,
      confidence: video.hostConfidence || "high",
      reason: "Preserved from the published snapshot",
      classifiedAt: video.classifiedAt || null
    };
  }
  return automatic;
}
