// Execute callbacks only in disposable tests. The telemetry dependency is mocked
// in the route test, so no real HTTP, external click or database write occurs.
export function after(callback) {
  if (typeof callback !== "function") throw new TypeError("Expected deferred callback");
  void callback();
}

export class NextResponse {
  static json(body, { status = 200, headers = {} } = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  }

  static redirect(target, status = 307) {
    return new Response(null, {
      status,
      headers: { location: String(target) },
    });
  }
}
