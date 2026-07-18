function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function responseText(body) {
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

export function normalizeHostClassification(parsed, hosts) {
  const rawHost = String(parsed.host || "").trim();
  const known = hosts.find((host) => (
    host.name.toLowerCase() === rawHost.toLowerCase()
    || host.fullName.toLowerCase() === rawHost.toLowerCase()
  ));
  const validName = /^[\p{L}][\p{L} .'-]{0,49}$/u.test(rawHost);
  const rawFullName = String(parsed.fullName || rawHost).trim();
  const validFullName = /^[\p{L}][\p{L} .'-]{0,79}$/u.test(rawFullName);
  const confidenceAccepted = known ? parsed.confidence !== "low" : parsed.confidence === "high";
  const accepted = rawHost.toLowerCase() !== "unknown" && validName && confidenceAccepted;
  return {
    host: accepted ? known?.name || rawHost : null,
    fullName: accepted ? known?.fullName || (validFullName ? rawFullName : rawHost) : null,
    confidence: parsed.confidence,
    reason: parsed.reason
  };
}

export async function classifyVideoHost(video, apiKey, options = {}) {
  const model = options.model || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const endpoint = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  endpoint.searchParams.set("key", apiKey);
  const hosts = options.hosts || [];
  const choices = hosts.map((host) => `${host.name} (${host.fullName})`).join(", ");
  const clipSeconds = options.clipSeconds || 30;
  const body = {
    contents: [{
      parts: [
        {
          fileData: { fileUri: `https://www.youtube.com/watch?v=${video.id}` },
          videoMetadata: { startOffset: "0s", endOffset: `${clipSeconds}s` }
        },
        {
          text: `Identify the main on-camera presenter who delivers the opening news story in this TechLinked video. Known hosts are: ${choices}. Return the listed short name exactly for a known host. If the presenter is someone else, return their commonly used short name and full name so they can be added as a new host. Use the presenter's face and voice, not names mentioned in the news, people in inserted clips, or brief cameos. If the presenter cannot be identified confidently, return Unknown. The video title is: ${video.title}`
        }
      ]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          host: { type: "string", description: "Known short host name, a newly identified short name, or Unknown" },
          fullName: { type: "string", description: "The presenter's full name, or Unknown" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string", description: "A brief visual or spoken reason for the identification" }
        },
        required: ["host", "fullName", "confidence", "reason"]
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
      return normalizeHostClassification(parsed, hosts);
    }

    lastError = new Error(result.error?.message || `Gemini returned ${response.status}`);
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    await wait(2000 * (2 ** attempt));
  }
  throw lastError;
}
