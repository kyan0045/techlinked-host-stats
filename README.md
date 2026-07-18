# TechLinked Host Stats

An unofficial hobby project comparing public views and likes across TechLinked hosts. The dashboard covers regular uploads from July 1, 2025 onward and is updated from a committed data snapshot.

This project is not affiliated with TechLinked, Linus Media Group, YouTube, or Google.

## How It Works

- The YouTube Data API supplies upload dates, views, likes, durations, and channel metadata.
- Videos shorter than or equal to three minutes are treated as Shorts and excluded.
- Videos are included only after they are seven days old, giving their statistics time to settle.
- Gemini identifies the presenter from the opening 30 seconds of each new video.
- Host names, full names, and chart colors are stored in `data/hosts.json`. Confidently identified new presenters are added automatically.
- Gemini generates one overall comparison of host performance using upload counts and raw view and like statistics.
- The published dashboard reads the generated snapshot from `data/videos.json`.

## Local Environment

Local development uses Node.js 20 or newer. Configuration is loaded from `.env`; `.env.example` contains the full set of quota controls in case you need to process large(r) numbers of videos.

```ini
YOUTUBE_API_KEY=your_youtube_api_key
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite

REPORT_START_DATE=2025-07-01
REPORT_END_DATE=today
MIN_VIDEO_AGE_DAYS=7
```

The local pipeline consists of:

```sh
npm install
npm run collect
npm run classify
npm run report
npm start
```

- `npm run collect` refreshes eligible YouTube videos and their current statistics.
- `npm run classify` processes unclassified videos in quota-safe Gemini batches.
- `npm run report` regenerates the overall host comparison.
- `npm start` serves the dashboard at `http://localhost:3000`.

Local classifications are kept in the ignored `data/auto-hosts.json` file. `data/gemini-usage.json` is committed so the scheduled workflow retains daily quota accounting across clean runners and manual reruns.

## Weekly Refresh

`.github/workflows/refresh-data.yml` runs every Monday at 08:15 UTC. TechLinked usually publishes on Tuesday, Thursday, and Saturday, so the Monday run captures a complete batch after every video has passed the seven-day maturity window.

The workflow:

1. Fetches uploads from July 1, 2025 through the current maturity cutoff.
2. Excludes Shorts.
3. Carries forward existing host classifications.
4. Classifies only newly eligible uploads.
5. Updates the host registry if a new presenter is found.
6. Regenerates the overall Gemini summary.
7. Commits `data/videos.json` and `data/hosts.json`.

The workflow reads `YOUTUBE_API_KEY` and `GEMINI_API_KEY` from GitHub Actions secrets. Its model defaults to `gemini-3.1-flash-lite` and can be changed through the `GEMINI_MODEL` Actions variable.
