const DEFAULT_TIMEOUT_MS = 15000;

function requiredConfig({ baseUrl, token }) {
  if (!baseUrl) throw new Error('AI_FAMILY_CORE_URL is required');
  if (!token) throw new Error('AI_FAMILY_CORE_TOKEN is required');
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:') throw new Error('AI_FAMILY_CORE_URL must use https');
  return parsed.origin;
}

export async function askFamilyCore({
  question,
  context = '',
  project = 'blindboxai',
  baseUrl = process.env.AI_FAMILY_CORE_URL,
  token = process.env.AI_FAMILY_CORE_TOKEN,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof question !== 'string' || !question.trim()) throw new Error('question is required');
  const origin = requiredConfig({ baseUrl, token });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${origin}/api/council`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: question.trim(), context, project }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Family Core request failed (${response.status})`);
    const result = await response.json();
    if (result?.status !== 'READY_FOR_REVIEW' || result?.actionAuthority !== 'none') {
      throw new Error('Family Core returned an unsafe or unexpected state');
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}
