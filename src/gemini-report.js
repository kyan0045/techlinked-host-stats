function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function responseText(body) {
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

export function overallReportStats(videos, hosts) {
  return hosts.map((host) => {
    const hosted = videos.filter((video) => video.host === host.name);
    const likes = hosted.map((video) => video.likes).filter((value) => value != null);
    const totalViews = hosted.reduce((sum, video) => sum + video.views, 0);
    const totalLikes = likes.reduce((sum, value) => sum + value, 0);
    return {
      host: host.name,
      uploads: hosted.length,
      totalViews,
      averageViews: hosted.length ? Math.round(totalViews / hosted.length) : null,
      totalLikes,
      averageLikes: likes.length ? Math.round(totalLikes / likes.length) : null,
      videosWithPublicLikes: likes.length
    };
  }).filter((host) => host.uploads > 0);
}

export function overallReportRankings(statistics) {
  const order = (key) => [...statistics]
    .filter((item) => item[key] != null)
    .sort((a, b) => b[key] - a[key])
    .map((item) => item.host);
  return {
    averageViewsHighestToLowest: order("averageViews"),
    averageLikesHighestToLowest: order("averageLikes")
  };
}

export async function generateOverallReport(videos, hosts, apiKey, options = {}) {
  const model = options.model || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  endpoint.searchParams.set("key", apiKey);
  const statistics = overallReportStats(videos, hosts);
  const rankings = overallReportRankings(statistics);
  const body = {
    contents: [{
      parts: [{
        text: `Write one concise comparative summary of four to six sentences about TechLinked host performance using only the supplied statistics and precomputed rankings. State who performs best on average and who appears the preferred host based on average views and average public likes. Describe the weakest result for each metric separately. Compare total views and likes only with the context of upload volume. Explicitly note small sample sizes when they make a ranking less reliable. Do not calculate or mention like rates, engagement rates, or percentages. Treat preference as an observation from these video metrics, not proof of audience sentiment or that a host caused the result. Use plain language and exact host names. Statistics: ${JSON.stringify(statistics)}. Rankings: ${JSON.stringify(rankings)}`
      }]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          summary: { type: "string" }
        },
        required: ["summary"]
      }
    }
  };

  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await options.beforeRequest?.();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (response.ok) {
      const parsed = JSON.parse(responseText(result));
      return String(parsed.summary || "Report unavailable.").trim();
    }
    lastError = new Error(result.error?.message || `Gemini returned ${response.status}`);
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    await wait(2000 * (2 ** attempt));
  }
  throw lastError;
}
