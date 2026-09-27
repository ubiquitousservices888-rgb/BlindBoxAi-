export function assertYoutubeShortsMetadata({ durationSeconds, width, height }) {
  const duration = Number(durationSeconds);
  const videoWidth = Number(width);
  const videoHeight = Number(height);
  if (![duration, videoWidth, videoHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("YouTube Short needs a measured duration and video dimensions");
  }
  // A conservative quality floor for owner-reviewed uploads, not a Buffer limit.
  if (duration < 1 || Math.min(videoWidth, videoHeight) < 240) {
    throw new Error("YouTube Short must be at least one second and 240 pixels on its shortest side");
  }
  if (duration > 180) throw new Error("YouTube Short exceeds Buffer's three-minute limit");

  const ratio = videoWidth / videoHeight;
  if (Math.abs(ratio - 1) > 0.01 && Math.abs(ratio - 9 / 16) > 0.01) {
    throw new Error("YouTube Short must be square or 9:16 portrait for Buffer");
  }
  return { durationSeconds: duration, width: videoWidth, height: videoHeight };
}
