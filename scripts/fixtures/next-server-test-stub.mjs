export function after() {}

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
