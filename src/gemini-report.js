function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function responseText(body) {
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

const LOW_SAMPLE_UPLOADS = 3;

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
      videosWithPublicLikes: likes.length,
      reliability: hosted.length < LOW_SAMPLE_UPLOADS ? "low" : "ok"
    };
  }).filter((host) => host.uploads > 0);
}

function marginToNext(gap, leaderValue) {
  if (gap == null) return null;
  if (gap === 0) return "tied";
  if (!leaderValue) return null;
  const ratio = gap / leaderValue;
  if (ratio < 0.05) return "narrow";
  if (ratio < 0.15) return "clear";
  return "wide";
}

function ranked(statistics, key) {
  const sorted = statistics.filter((item) => item[key] != null).sort((a, b) => b[key] - a[key]);
  const leaderValue = sorted[0]?.[key] ?? null;
  return sorted.map((item, index) => {
    const next = sorted[index + 1];
    const gap = next ? item[key] - next[key] : null;
    return {
      rank: index + 1,
      host: item.host,
      marginToNext: marginToNext(gap, leaderValue)
    };
  });
}

function followsUploads(statistics, key) {
  const ordered = [...statistics].sort((a, b) => b.uploads - a.uploads);
  return ordered.every((item, index) => index === 0 || ordered[index - 1][key] >= item[key]);
}

export function overallReportRankings(statistics) {
  const averageViews = ranked(statistics, "averageViews");
  const averageLikes = ranked(statistics, "averageLikes");
  return {
    averageViews,
    averageLikes,
    spread: {
      averageViews: spreadLabel(averageViews),
      averageLikes: spreadLabel(averageLikes)
    },
    volume: {
      totalViewsFollowUploads: followsUploads(statistics, "totalViews"),
      totalLikesFollowUploads: followsUploads(statistics, "totalLikes")
    }
  };
}

export function overallReportCaveats(statistics) {
  const caveats = statistics
    .filter((item) => item.reliability === "low")
    .sort((a, b) => a.uploads - b.uploads)
    .map((item) => `${item.host} has ${item.uploads} upload${item.uploads === 1 ? "" : "s"}, so that ranking is uncertain.`);
  if (statistics.some((item) => item.videosWithPublicLikes < item.uploads)) {
    caveats.push("Some videos hide likes, so average likes use fewer videos than uploads.");
  }
  return caveats;
}

function spreadLabel(items) {
  if (items.length < 3) return "too few hosts to judge";
  const gaps = items.slice(0, -1);
  const close = gaps.filter((item) => item.marginToNext === "narrow" || item.marginToNext === "tied").length;
  return close * 2 >= gaps.length ? "tightly grouped" : "spread out";
}

export function overallReportPrompt(statistics, rankings) {
  return `Write a short, plain-language report about TechLinked host performance using only the supplied statistics and rankings. Focus on the big picture rather than a host-by-host breakdown.
Rules:
- Use the exact host names from the statistics. Never add a surname.
- Do not use digits, exact values, percentages, or like and engagement rates anywhere in the headline or findings.
- Describe how close results are only with the supplied marginToNext and spread labels. Do not recalculate or invent a margin.
- Never say or imply that a host caused the results, that these figures prove audience preference, or that one host is "better".
- If a ranking is tied, say so instead of choosing a winner.
Output:
- headline: one sentence of at most 120 characters naming who leads on average views and, when different, average likes.
- findings: two or three entries, one per topic, in this order when the data supports it:
  "leader" - who leads and whether that lead is narrow, clear, or wide across the two average metrics; mention only the leader and the margins, not the rest of the field;
  "spread" - whether average views and average likes are tightly grouped or spread out, using the supplied spread labels and noting when the two metrics differ;
  "volume" - whether total views and total likes follow upload volume, using the supplied volume flags.
  Each "text" is a single sentence with no numbers.
- interpretation: one sentence beginning "Interpretation:" that frames the results as observations from video metrics rather than proof of audience sentiment.
Statistics: ${JSON.stringify(statistics)}
Rankings: ${JSON.stringify(rankings)}`;
}

export async function generateOverallReport(videos, hosts, apiKey, options = {}) {
  const model = options.model || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  endpoint.searchParams.set("key", apiKey);
  const statistics = overallReportStats(videos, hosts);
  const rankings = overallReportRankings(statistics);
  const body = {
    contents: [{
      parts: [{
        text: overallReportPrompt(statistics, rankings)
      }]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          headline: { type: "string" },
          findings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                topic: { type: "string", enum: ["leader", "spread", "volume"] },
                text: { type: "string" }
              },
              required: ["topic", "text"]
            }
          },
          interpretation: { type: "string" }
        },
        required: ["headline", "findings", "interpretation"]
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
      return {
        headline: String(parsed.headline || "Report unavailable.").trim(),
        findings: Array.isArray(parsed.findings)
          ? parsed.findings.map((finding) => ({
            topic: String(finding.topic || "").trim(),
            text: String(finding.text || "").trim()
          }))
          : [],
        caveats: overallReportCaveats(statistics),
        interpretation: String(parsed.interpretation || "").trim()
      };
    }
    lastError = new Error(result.error?.message || `Gemini returned ${response.status}`);
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    await wait(2000 * (2 ** attempt));
  }
  throw lastError;
}
