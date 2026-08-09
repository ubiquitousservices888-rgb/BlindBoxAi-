import fs from "node:fs";
import path from "node:path";

export const AFFILIATE_DISCLOSURE = "#ad BlindBoxAI may earn a commission from qualifying purchases.";
const CHANNELS = ["tiktok", "instagram", "facebook", "x", "pinterest"];
const CHANNEL_HOOK = {
  tiktok: "Collector check before you checkout:",
  instagram: "BlindBoxAI collector brief:",
  facebook: "New BlindBoxAI collector brief:",
  x: "Collector brief:",
  pinterest: "Collector pin brief:",
};

function parseArgs(argv) {
  const options = {
    channel: "all",
    outDir: path.join(process.cwd(), "data", "labubu", "generated"),
    startAt: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--channel") options.channel = argv[++i];
    else if (arg === "--out-dir") options.outDir = path.resolve(argv[++i]);
    else if (arg === "--start-at") options.startAt = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readSeries(baseDir) {
  const seriesDir = path.join(baseDir, "series");
  return fs
    .readdirSync(seriesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(seriesDir, file)))
    .filter((series) => series.status === "verified")
    .sort((a, b) => a.name.localeCompare(b.name));
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(rows, headers) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function makePostingTime(baseDate, channelIndex, rowIndex) {
  const date = new Date(baseDate.getTime());
  date.setUTCMinutes(date.getUTCMinutes() + (channelIndex * 15) + (rowIndex * 35));
  return date.toISOString();
}

function normalizeStartAt(startAt) {
  if (startAt) {
    const parsed = new Date(startAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid --start-at value: ${startAt}`);
    }
    return parsed;
  }

  const nextHour = new Date();
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  return nextHour;
}

function makeCaption(series, channel) {
  const bullets = (series.copy_points || []).slice(0, 2).join(" ");
  return [
    CHANNEL_HOOK[channel],
    `${series.name} • ${series.brand}`,
    bullets,
    `View verified collector guidance: ${series.cta_url}`,
    AFFILIATE_DISCLOSURE,
  ].join(" ");
}

function makeTags(series) {
  return (series.tags || []).join(", ");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function resolveVideoUrl(baseUrl, videoPath) {
  if (!baseUrl || !videoPath) return null;
  const cleanBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(videoPath, cleanBase).toString();
}

export function generateLabubuOutputs({ baseDir, outDir, channel = "all", startAt = null }) {
  const designTokens = readJson(path.join(baseDir, "design-tokens.json"));
  const videoManifest = readJson(path.join(baseDir, "video-manifest.json"));
  const series = readSeries(baseDir);
  const selectedChannels = channel === "all" ? CHANNELS : [channel];

  for (const requested of selectedChannels) {
    if (!CHANNELS.includes(requested)) {
      throw new Error(`Unsupported channel: ${requested}`);
    }
  }

  ensureDir(outDir);
  const startDate = normalizeStartAt(startAt);
  const outputs = [];

  selectedChannels.forEach((selectedChannel, channelIndex) => {
    const headers =
      selectedChannel === "pinterest"
        ? ["Text", "Image URL", "Tags", "Posting Time", "Board Name"]
        : ["Text", "Image URL", "Tags", "Posting Time"];

    const rows = series.map((entry, rowIndex) => {
      const row = {
        Text: makeCaption(entry, selectedChannel),
        "Image URL": entry.media?.image_url || "",
        Tags: makeTags(entry),
        "Posting Time": makePostingTime(startDate, channelIndex, rowIndex),
      };

      if (selectedChannel === "pinterest") {
        row["Board Name"] = entry.board_name || "Blind Box Collecting";
      }

      return row;
    });

    const csv = toCsv(rows, headers);
    const fileName = `labubu-buffer-${selectedChannel}.csv`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, csv, "utf8");
    outputs.push({ channel: selectedChannel, filePath, rows: rows.length, headers });
  });

  const videoBaseUrl = process.env[videoManifest.video_base_url_env || "BLINDBOXAI_VIDEO_BASE_URL"] || "";
  const videoPayloads = videoManifest.entries
    .filter((entry) => entry.status === "verified")
    .map((entry) => {
      const videoUrl = resolveVideoUrl(videoBaseUrl, entry.video_path);
      return {
        slug: entry.slug,
        text: `${entry.slug.replace(/-/g, " ")} ${AFFILIATE_DISCLOSURE}`,
        cta_url: series.find((seriesEntry) => seriesEntry.slug === entry.slug)?.cta_url || null,
        video_url: videoUrl,
        buffer_api_ready: Boolean(videoUrl),
      };
    });

  const videoPayloadPath = path.join(outDir, "labubu-buffer-video-api-payloads.json");
  fs.writeFileSync(
    videoPayloadPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        design_template: designTokens.social_template?.name || null,
        publish_path: "buffer_api_video",
        note: "CSV upload is text+image only. Video publishing uses Buffer API payloads.",
        payloads: videoPayloads,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    outputs,
    videoPayloadPath,
    generatedAt: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv);
  const baseDir = path.join(process.cwd(), "data", "labubu");
  const result = generateLabubuOutputs({
    baseDir,
    outDir: options.outDir,
    channel: options.channel,
    startAt: options.startAt,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
