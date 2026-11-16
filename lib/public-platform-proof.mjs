// Parse public response metadata only. No scripts are evaluated and no media
// URL found in a response is fetched. Unknown platform markup fails closed.
export function publicPostMediaId(channel, value) {
  try {
    const url = new URL(value);
    if (channel === "youtube") return url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.split("/").filter(Boolean).at(-1);
    if (channel === "tiktok") return url.pathname.match(/\/video\/(\d+)\/?$/)?.[1] || null;
  } catch {}
  return null;
}

function jsonObjectAt(source, start) {
  if (source[start] !== "{") throw new Error("Missing player JSON");
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return JSON.parse(source.slice(start, index + 1));
  }
  throw new Error("Incomplete player JSON");
}

function unavailable(reason) {
  return Object.assign(new Error("Exact public video metadata unavailable"), { publicProofReason: reason });
}

export function publicMediaMetadataProof(channel, url, html) {
  const mediaId = publicPostMediaId(channel, url);
  if (!mediaId) throw new Error("Missing public media identity");
  if (channel === "youtube") {
    const marker = /(?:ytInitialPlayerResponse|window\["ytInitialPlayerResponse"\])\s*=\s*/.exec(html);
    const player = marker ? jsonObjectAt(html, marker.index + marker[0].length) : null;
    if (!player) throw unavailable("PUBLIC_PLAYER_METADATA_MISSING");
    const formats = [...(player?.streamingData?.formats || []), ...(player?.streamingData?.adaptiveFormats || [])];
    if (player.playabilityStatus?.status !== "OK") throw unavailable("PUBLIC_PLAYER_UNPLAYABLE");
    if (player.videoDetails?.videoId !== mediaId) throw unavailable("PUBLIC_MEDIA_ID_MISMATCH");
    if (player.videoDetails.isPrivate) throw unavailable("PUBLIC_MEDIA_PRIVATE");
    if (!formats.some((format) => /^video\//.test(format?.mimeType || "") && (format.url || format.signatureCipher))) throw unavailable("PUBLIC_STREAM_METADATA_MISSING");
    return { publicMediaAvailable: true, mediaId, method: "youtube_player_response" };
  }
  if (channel === "tiktok") {
    const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi);
    const raw = [...scripts].find((match) => /\bid\s*=\s*["']__UNIVERSAL_DATA_FOR_REHYDRATION__["']/i.test(match[1]))?.[2];
    const detail = raw ? JSON.parse(raw)?.__DEFAULT_SCOPE__?.["webapp.video-detail"] : null;
    if (!detail) throw unavailable("PUBLIC_PLAYER_METADATA_MISSING");
    const item = detail?.itemInfo?.itemStruct;
    let hasPlaybackAddress = false;
    try { hasPlaybackAddress = new URL(item?.video?.playAddr).protocol === "https:"; } catch {}
    if (detail.statusCode !== 0) throw unavailable("PUBLIC_PLAYER_UNPLAYABLE");
    if (String(item?.id) !== mediaId) throw unavailable("PUBLIC_MEDIA_ID_MISMATCH");
    if (item.privateItem || item.secret || item.isPrivate) throw unavailable("PUBLIC_MEDIA_PRIVATE");
    if (!hasPlaybackAddress) throw unavailable("PUBLIC_STREAM_METADATA_MISSING");
    return { publicMediaAvailable: true, mediaId, method: "tiktok_video_detail" };
  }
  throw new Error("Public availability verification is unsupported for this channel");
}
