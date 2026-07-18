import { classificationSettings } from "./classification-settings.js";
import { loadEnvironment } from "./env.js";
import { generateOverallReport } from "./gemini-report.js";
import { readHostRegistry } from "./host-registry.js";
import { createGeminiLimiter } from "./quota.js";
import { readJson, videosPath, writeJson } from "./storage.js";

await loadEnvironment();
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY. Add it to .env or the environment.");
  process.exitCode = 1;
} else {
  try {
    const data = await readJson(videosPath, null);
    if (!data) throw new Error("No video data found. Run npm run collect first.");
    const hosts = await readHostRegistry();
    const settings = classificationSettings(process.argv.slice(2));
    const beforeRequest = await createGeminiLimiter({
      requestsPerMinute: settings.requestsPerMinute,
      dailyLimit: settings.dailyLimit,
      onDelay: (milliseconds) => console.log(`Waiting ${Math.ceil(milliseconds / 1000)}s for the request limit...`)
    });
    const summary = await generateOverallReport(data.videos, hosts, apiKey, {
      ...settings,
      beforeRequest
    });
    delete data.hostReports;
    data.overallReport = {
      generatedAt: new Date().toISOString(),
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      summary
    };
    await writeJson(videosPath, data);
    console.log("Generated the overall host performance summary.");
  } catch (error) {
    console.error(`Report generation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
