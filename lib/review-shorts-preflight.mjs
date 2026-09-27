import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertYoutubeShortsMetadata } from "./review-shorts-eligibility.mjs";

const execFileAsync = promisify(execFile);

async function ffprobe(videoUrl) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,duration,width,height",
      "-of", "json", "-i", videoUrl,
    ], { timeout: 45_000, maxBuffer: 64 * 1024 }));
  } catch {
    // Do not echo provider stderr: it can contain a media URL or signed query.
    throw new Error("Could not independently inspect the YouTube video before publishing");
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("YouTube video probe returned invalid metadata");
  }
}

export async function probeYoutubeShortsMedia(videoUrl, probeImpl = ffprobe) {
  const metadata = await probeImpl(videoUrl);
  const video = metadata?.streams?.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("YouTube video probe found no video stream");
  return assertYoutubeShortsMetadata({
    durationSeconds: metadata?.format?.duration ?? video.duration,
    width: video.width,
    height: video.height,
  });
}
