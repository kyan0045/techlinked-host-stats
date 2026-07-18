import { geminiUsagePath, readJson, writeJson } from "./storage.js";

export class DailyLimitReachedError extends Error {
  constructor(limit) {
    super(`Configured Gemini daily limit of ${limit} requests has been reached`);
    this.name = "DailyLimitReachedError";
    this.code = "GEMINI_DAILY_LIMIT";
  }
}

function pacificDate(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(timestamp);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function createGeminiLimiter(options) {
  const usagePath = options.usagePath || geminiUsagePath;
  const now = options.now || (() => Date.now());
  const delay = options.sleep || sleep;
  const minute = 60_000;
  const minimumInterval = Math.ceil(minute / options.requestsPerMinute);
  let usage = await readJson(usagePath, { date: pacificDate(now()), requests: 0, requestTimes: [] });

  return async function beforeRequest() {
    let currentTime = now();
    const currentDate = pacificDate(currentTime);
    if (usage.date !== currentDate) usage = { date: currentDate, requests: 0, requestTimes: [] };
    if (usage.requests >= options.dailyLimit) throw new DailyLimitReachedError(options.dailyLimit);

    usage.requestTimes = (usage.requestTimes || []).filter((timestamp) => timestamp > currentTime - minute);
    const lastRequest = usage.requestTimes.at(-1);
    const intervalWait = lastRequest == null ? 0 : lastRequest + minimumInterval - currentTime;
    const windowWait = usage.requestTimes.length < options.requestsPerMinute
      ? 0
      : usage.requestTimes[0] + minute - currentTime;
    const waitTime = Math.max(intervalWait, windowWait, 0);
    if (waitTime > 0) {
      options.onDelay?.(waitTime);
      await delay(waitTime);
      currentTime = now();
      usage.requestTimes = usage.requestTimes.filter((timestamp) => timestamp > currentTime - minute);
    }

    usage.requests += 1;
    usage.requestTimes.push(currentTime);
    await writeJson(usagePath, usage);
  };
}
