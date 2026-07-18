import { readFile } from "node:fs/promises";
import { calculateMetrics } from "../src/metrics.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const [data, hosts] = await Promise.all([
      readFile(new URL("../data/videos.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../data/hosts.json", import.meta.url), "utf8").then(JSON.parse)
    ]);
    response.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600");
    return response.status(200).json({ ...data, hosts, metrics: calculateMetrics(data.videos, hosts) });
  } catch (error) {
    return response.status(500).json({ error: `Could not load dashboard data: ${error.message}` });
  }
}
