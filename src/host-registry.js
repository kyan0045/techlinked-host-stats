import { hostsPath, readJson, writeJson } from "./storage.js";

const colors = ["#0891b2", "#059669", "#db2777", "#ea580c", "#4f46e5", "#65a30d"];

export async function readHostRegistry() {
  return readJson(hostsPath, []);
}

export function mergeDiscoveredHosts(hosts, automatic) {
  let changed = false;
  for (const result of Object.values(automatic)) {
    if (!result.host) continue;
    const known = hosts.some((host) => host.name.toLowerCase() === result.host.toLowerCase());
    if (known) continue;
    if (result.confidence !== "high") continue;
    hosts.push({
      name: result.host,
      fullName: result.fullName || result.host,
      color: colors[hosts.length % colors.length]
    });
    changed = true;
  }
  return changed;
}

export async function registerDiscoveredHosts(hosts, automatic) {
  const changed = mergeDiscoveredHosts(hosts, automatic);
  if (changed) await writeJson(hostsPath, hosts);
  return hosts;
}
