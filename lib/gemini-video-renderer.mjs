export const GEMINI_OMNI_MODEL = "gemini-omni-1.1-flash";
export const GEMINI_INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

function clean(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function validResolution(value) {
  return ["360p", "720p", "1080p", "4k"].includes(value);
}

export function buildGeminiVideoPrompt(record) {
  const title = clean(record?.script?.title, "record.script.title");
  const facts = Array.isArray(record?.script?.facts)
    ? record.script.facts.map((fact) => String(fact ?? "").trim()).filter(Boolean).slice(0, 3)
    : [];
  return [
    "Create a short vertical 9:16 collector-information video for BlindBoxAI.",
    `Topic: ${title}.`,
    facts.length ? `Verified facts only: ${facts.join(" | ")}` : "No additional product facts are authorized.",
    "Use clean studio-style collectible display visuals, subtle camera motion, shelves, lighting, packaging-neutral shapes, and readable kinetic typography.",
    "Do not fabricate or imitate the exact appearance of a branded collectible when no verified reference image is supplied.",
    "Do not invent prices, rarity, pull odds, resale claims, logos, seller claims, or product details.",
    "Do not show merchant URLs. Do not add claims beyond the verified facts above.",
    "End with simple on-screen text: Research before you buy — BlindBoxAI.com.",
  ].join("\n");
}

export async function renderGeminiOmni({
  apiKey,
  record,
  uploadVideo,
  resolution = "360p",
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");
  if (typeof uploadVideo !== "function") throw new Error("A video upload callback is required");
  if (!validResolution(resolution)) throw new Error("Gemini video resolution must be 360p, 720p, 1080p, or 4k");

  const response = await fetchImpl(`${GEMINI_INTERACTIONS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GEMINI_OMNI_MODEL,
      input: buildGeminiVideoPrompt(record),
      response_format: {
        type: "video",
        aspect_ratio: "9:16",
        resolution,
      },
    }),
  });
  if (!response.ok) throw new Error(`Gemini Omni render request failed: ${response.status}`);
  const interaction = await response.json();
  const base64 = interaction?.output_video?.data;
  if (typeof base64 !== "string" || base64.length < 32) throw new Error("Gemini Omni returned no usable video data");

  let bytes;
  try { bytes = Buffer.from(base64, "base64"); }
  catch { throw new Error("Gemini Omni video data was not valid base64"); }
  if (!bytes.length) throw new Error("Gemini Omni returned an empty video");

  const filename = `${clean(record?.id, "record.id")}-gemini.mp4`;
  const uploaded = await uploadVideo({ bytes, filename, contentType: "video/mp4" });
  const videoUrl = uploaded?.url;
  try {
    const url = new URL(videoUrl);
    if (url.protocol !== "https:" || !/\.mp4(?:$|\?)/i.test(url.toString())) throw new Error();
  } catch {
    throw new Error("Gemini Omni upload must return a hosted HTTPS MP4 URL");
  }

  return {
    id: clean(interaction?.id ?? `gemini-${record.id}`, "interaction.id"),
    videoUrl,
    provider: "gemini-omni",
    model: GEMINI_OMNI_MODEL,
    resolution,
  };
}
