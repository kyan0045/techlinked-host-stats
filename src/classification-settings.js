function positiveInteger(value, name, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function argumentValue(argumentsList, name) {
  const prefix = `--${name}=`;
  return argumentsList.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

export function classificationSettings(argumentsList = []) {
  return {
    requestsPerMinute: positiveInteger(
      argumentValue(argumentsList, "rpm") ?? process.env.npm_config_rpm ?? process.env.GEMINI_REQUESTS_PER_MINUTE,
      "GEMINI_REQUESTS_PER_MINUTE",
      15
    ),
    dailyLimit: positiveInteger(
      argumentValue(argumentsList, "daily-limit") ?? process.env.npm_config_daily_limit ?? process.env.GEMINI_DAILY_REQUEST_LIMIT,
      "GEMINI_DAILY_REQUEST_LIMIT",
      500
    ),
    batchSize: positiveInteger(
      argumentValue(argumentsList, "batch-size") ?? process.env.npm_config_batch_size ?? process.env.GEMINI_BATCH_SIZE,
      "GEMINI_BATCH_SIZE",
      15
    ),
    clipSeconds: positiveInteger(
      argumentValue(argumentsList, "clip-seconds") ?? process.env.npm_config_clip_seconds ?? process.env.GEMINI_CLIP_SECONDS,
      "GEMINI_CLIP_SECONDS",
      30
    )
  };
}
