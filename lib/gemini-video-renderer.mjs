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

  const response = await fetchImpl(GEMINI_INTERACTIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(180_000),
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
  // The REST Interactions API returns raw videos in steps[].content[].
  // output_video is an SDK-only convenience field, not a REST response field.
  if (interaction?.status !== "completed" || interaction?.model !== GEMINI_OMNI_MODEL) {
    throw new Error("Gemini Omni did not return a completed response from the expected model");
  }
  const videos = (Array.isArray(interaction.steps) ? interaction.steps : [])
    .filter((step) => step?.type === "model_output")
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter((item) => item?.type === "video" && item?.mime_type === "video/mp4");
  if (videos.length !== 1) throw new Error("Gemini Omni returned an unexpected video count");
  const base64 = videos[0]?.data;
  if (typeof base64 !== "string" || base64.length < 32 || base64.length > 140 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Gemini Omni returned no usable bounded MP4 data");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.byteLength > 100 * 1024 * 1024) {
    throw new Error("Gemini Omni returned an empty or oversized video");
  }

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
