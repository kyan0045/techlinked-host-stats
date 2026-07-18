import { completeMonths, continuousMonths, dottedPointIndexes, trendSegments } from "./trend.js";

const app = document.querySelector("#app");
const template = document.querySelector("#dashboard-template");
const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const exactNumber = new Intl.NumberFormat("en");
let data;

function colorFor(host) {
  return data.metrics.byHost.find((item) => item.host === host)?.color || "#64748b";
}

function compact(value) {
  return value == null ? "N/A" : compactNumber.format(value);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function ranked(key = "averageViews") {
  return [...data.metrics.byHost].sort((a, b) => (b[key] || 0) - (a[key] || 0));
}

function renderSummary() {
  const classified = data.videos.filter((video) => video.host);
  const totalViews = classified.reduce((sum, video) => sum + video.views, 0);
  const likes = classified.map((video) => video.likes).filter((value) => value != null);
  const averageViews = classified.length ? Math.round(totalViews / classified.length) : null;
  const averageLikes = likes.length ? Math.round(likes.reduce((sum, value) => sum + value, 0) / likes.length) : null;
  const values = [
    ["Videos analyzed", exactNumber.format(classified.length)],
    ["Total views", compact(totalViews)],
    ["Average views", compact(averageViews)],
    ["Average likes", compact(averageLikes)]
  ];
  document.querySelector("#summary").innerHTML = values.map(([label, value]) => `
    <div><span>${label}</span><strong>${value}</strong></div>
  `).join("");
}

function renderBars(elementId, key) {
  const rows = ranked(key);
  const maximum = Math.max(...rows.map((item) => item[key] || 0), 1);
  document.querySelector(elementId).innerHTML = rows.map((item) => `
    <div class="bar-row" style="--series:${colorFor(item.host)}">
      <span class="bar-label">${item.host}</span>
      <div class="bar-track"><i style="width:${((item[key] || 0) / maximum) * 100}%"></i></div>
      <strong>${compact(item[key])}</strong>
    </div>
  `).join("");
}

function monthlySeries() {
  const groups = new Map();
  for (const video of data.videos.filter((item) => item.host)) {
    const date = new Date(video.publishedAt);
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const key = `${month}:${video.host}`;
    const group = groups.get(key) || { total: 0, count: 0 };
    group.total += video.views;
    group.count += 1;
    groups.set(key, group);
  }

  const months = completeMonths(
    continuousMonths([...groups.keys()].map((key) => key.slice(0, 7))),
    data.range.start,
    data.range.endExclusive
  );
  const series = data.metrics.byHost.map(({ host }) => ({
    host,
    values: months.map((month) => {
      const group = groups.get(`${month}:${host}`);
      return group ? Math.round(group.total / group.count) : null;
    })
  }));
  return { months, series };
}

function renderTrend() {
  const { months, series } = monthlySeries();
  const width = 1000;
  const height = 330;
  const plot = { left: 60, right: 18, top: 20, bottom: 48 };
  const values = series.flatMap((item) => item.values).filter((value) => value != null);
  const maximum = Math.max(...values, 1);
  const roundedMaximum = Math.ceil(maximum / 10000) * 10000;
  const x = (index) => plot.left + (index * (width - plot.left - plot.right)) / Math.max(months.length - 1, 1);
  const y = (value) => plot.top + (1 - value / roundedMaximum) * (height - plot.top - plot.bottom);
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = roundedMaximum * (1 - index / 4);
    const position = plot.top + (index * (height - plot.top - plot.bottom)) / 4;
    return `<line x1="${plot.left}" y1="${position}" x2="${width - plot.right}" y2="${position}"></line><text x="${plot.left - 12}" y="${position + 4}" text-anchor="end">${compact(value)}</text>`;
  }).join("");
  const labels = months.map((month, index) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    const label = date.toLocaleDateString("en", { month: "short", year: index === 0 || date.getUTCMonth() === 0 ? "2-digit" : undefined, timeZone: "UTC" });
    return `<text x="${x(index)}" y="${height - 15}" text-anchor="middle">${label}</text>`;
  }).join("");
  const lines = series.map((item) => {
    const segments = trendSegments(item.values);
    const paths = segments.map((segment) => (
      `<path class="${segment.dotted ? "missing" : "observed"}" d="M ${x(segment.from.index)} ${y(segment.from.value)} L ${x(segment.to.index)} ${y(segment.to.value)}" style="--series:${colorFor(item.host)}"></path>`
    )).join("");
    const points = dottedPointIndexes(segments).map((index) => (
      `<circle cx="${x(index)}" cy="${y(item.values[index])}" r="4" style="--series:${colorFor(item.host)}"></circle>`
    )).join("");
    return paths + points;
  }).join("");

  document.querySelector("#trend-chart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly average views by host"><g class="grid-lines">${grid}${labels}</g><g class="series-lines">${lines}</g></svg>`;
  document.querySelector("#trend-legend").innerHTML = series.map((item) => `<span style="--series:${colorFor(item.host)}"><i></i>${item.host}</span>`).join("");
}

function renderUploadTimeline() {
  const width = 1000;
  const height = 260;
  const plot = { left: 82, right: 18, top: 24, bottom: 42 };
  const hosts = data.metrics.byHost.map((item) => item.host);
  const start = new Date(data.range.start);
  const end = new Date(data.range.endExclusive);
  const duration = end.getTime() - start.getTime();
  const x = (date) => plot.left + ((date.getTime() - start.getTime()) / duration) * (width - plot.left - plot.right);
  const y = (index) => plot.top + 20 + (index * (height - plot.top - plot.bottom - 40)) / Math.max(hosts.length - 1, 1);

  const months = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  while (cursor < end) {
    months.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const monthGrid = months.map((month, index) => {
    const position = x(month);
    const showYear = index === 0 || month.getUTCMonth() === 0;
    const label = month.toLocaleDateString("en", { month: "short", year: showYear ? "2-digit" : undefined, timeZone: "UTC" });
    return `<line x1="${position}" y1="${plot.top}" x2="${position}" y2="${height - plot.bottom}"></line><text x="${position}" y="${height - 15}" text-anchor="middle">${label}</text>`;
  }).join("");
  const lanes = hosts.map((host, index) => `
    <line x1="${plot.left}" y1="${y(index)}" x2="${width - plot.right}" y2="${y(index)}"></line>
    <text x="${plot.left - 14}" y="${y(index) + 4}" text-anchor="end">${host}</text>
  `).join("");
  const markers = data.videos.filter((video) => video.host).map((video) => {
    const hostIndex = hosts.indexOf(video.host);
    const position = x(new Date(video.publishedAt));
    return `<line class="upload-marker" style="--series:${colorFor(video.host)}" x1="${position}" y1="${y(hostIndex) - 10}" x2="${position}" y2="${y(hostIndex) + 10}"></line>`;
  }).join("");

  document.querySelector("#upload-timeline").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="TechLinked uploads by date and host">
      <g class="timeline-grid">${monthGrid}${lanes}</g>
      <g class="timeline-markers">${markers}</g>
    </svg>`;
}

function renderTable() {
  document.querySelector("#results-body").innerHTML = ranked().map((item) => {
    return `<div class="results-row" style="--series:${colorFor(item.host)}">
      <span class="host-cell"><i></i><strong>${item.host}</strong></span>
      <span data-label="Uploads">${exactNumber.format(item.videos)}</span>
      <span data-label="Total views">${compact(item.totalViews)}</span>
      <span data-label="Avg. views">${compact(item.averageViews)}</span>
      <span data-label="Total likes">${compact(item.totalLikes)}</span>
      <span data-label="Avg. likes">${compact(item.averageLikes)}</span>
    </div>`;
  }).join("");
}

function renderOverallReport() {
  if (!data.overallReport?.summary) return;
  const container = document.querySelector("#generated-report");
  container.hidden = false;
  document.querySelector("#report-meta").textContent = `${data.overallReport.model} / ${formatDate(data.overallReport.generatedAt)}`;
  document.querySelector("#overall-report").textContent = data.overallReport.summary;
}

async function init() {
  try {
    const response = await fetch("/api/data");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    data = result;
    app.replaceChildren(template.content.cloneNode(true));
    const endInclusive = new Date(new Date(data.range.endExclusive).getTime() - 1);
    document.querySelector("#report-range").textContent = `${formatDate(data.range.start)} - ${formatDate(endInclusive)}`;
    const avatar = document.querySelector("#channel-avatar");
    if (data.channel.avatar) avatar.src = data.channel.avatar;
    document.querySelector("#updated").textContent = `Updated ${new Date(data.collectedAt).toLocaleDateString("en", { dateStyle: "medium" })}`;
    renderSummary();
    renderBars("#views-chart", "averageViews");
    renderBars("#likes-chart", "averageLikes");
    renderTrend();
    renderUploadTimeline();
    renderTable();
    renderOverallReport();
  } catch (error) {
    app.innerHTML = `<div class="empty-state"><h2>No report generated</h2><p class="error"></p><p>Run <code>npm run collect</code> to create the dataset.</p></div>`;
    app.querySelector(".error").textContent = error.message;
    document.querySelector("#updated").textContent = "Data unavailable";
  }
}

init();
