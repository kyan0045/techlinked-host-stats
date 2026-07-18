function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export function calculateMetrics(videos, hosts = []) {
  const names = [...hosts.map((host) => host.name)];
  for (const video of videos) {
    if (video.host && !names.includes(video.host)) names.push(video.host);
  }
  const byHost = names.map((hostName) => {
    const hosted = videos.filter((video) => video.host === hostName);
    const likes = hosted.map((video) => video.likes).filter((value) => value != null);
    const metadata = hosts.find((host) => host.name === hostName);
    return {
      host: hostName,
      fullName: metadata?.fullName || hostName,
      color: metadata?.color || "#64748b",
      videos: hosted.length,
      totalViews: hosted.reduce((sum, video) => sum + video.views, 0),
      totalLikes: likes.reduce((sum, value) => sum + value, 0),
      averageViews: average(hosted.map((video) => video.views)),
      averageLikes: average(likes),
      likesAvailable: likes.length
    };
  });

  return {
    byHost,
    totalVideos: videos.length,
    classifiedVideos: videos.filter((video) => video.host).length,
    unknownVideos: videos.filter((video) => !video.host).length
  };
}
