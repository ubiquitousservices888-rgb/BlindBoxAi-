function lookupError(message, analyticsFailureType) {
  const error = new Error(message);
  error.analyticsFailureType = analyticsFailureType;
  return error;
}

export async function parseLookupResponse(response) {
  let body = {};
  try {
    body = await response.json();
  } catch {
    if (response.ok) {
      throw lookupError("The lookup returned an invalid response.", "service_unavailable");
    }
  }

  if (!response.ok) {
    throw lookupError(
      body?.error || "The lookup could not be completed.",
      response.status >= 500 ? "service_unavailable" : "request_rejected",
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.matches)) {
    throw lookupError("The lookup returned an invalid response.", "service_unavailable");
  }
  return body;
}
