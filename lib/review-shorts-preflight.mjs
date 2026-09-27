import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertYoutubeShortsMetadata } from "./review-shorts-eligibility.mjs";

const execFileAsync = promisify(execFile);

async function ffprobe(videoUrl) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,duration,width,height:stream_tags=rotate:stream_disposition=attached_pic,default:stream_side_data=rotation",
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
  const videoStreams = (metadata?.streams ?? []).filter((stream) => stream.codec_type === "video" && Number(stream.disposition?.attached_pic) !== 1);
  const video = videoStreams.find((stream) => Number(stream.disposition?.default) === 1) ?? videoStreams[0];
  if (!video) throw new Error("YouTube video probe found no video stream");
  const rotation = video.side_data_list?.find((entry) => entry.rotation != null)?.rotation ?? video.tags?.rotate ?? 0;
  const quarterTurn = Number.isFinite(Number(rotation)) && Math.abs(Number(rotation) % 180) === 90;
  return assertYoutubeShortsMetadata({
    durationSeconds: metadata?.format?.duration ?? video.duration,
    width: quarterTurn ? video.height : video.width,
    height: quarterTurn ? video.width : video.height,
  });
}
