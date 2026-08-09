const ALLOWED_ORIGINS = new Set([
  "https://eugenefacecontrol.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const MAX_PAYLOAD_LENGTH = 1_500_000;
const SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function createId() {
  return crypto.randomUUID().replaceAll("-", "");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return cors ? new Response(null, { status: 204, headers: cors }) : json({ error: "Origin not allowed" }, 403);
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({ service: "voicy-share", status: "ok", ttlDays: 30 });
    }

    if (!cors) return json({ error: "Origin not allowed" }, 403);

    if (url.pathname === "/shares" && request.method === "POST") {
      const contentLength = Number(request.headers.get("Content-Length") || 0);
      if (contentLength > MAX_PAYLOAD_LENGTH * 1.4) return json({ error: "Payload too large" }, 413, cors);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400, cors);
      }

      if (typeof body?.data !== "string" || !/^[A-Za-z0-9_-]+$/.test(body.data)) {
        return json({ error: "Invalid payload" }, 400, cors);
      }
      if (body.data.length > MAX_PAYLOAD_LENGTH) return json({ error: "Payload too large" }, 413, cors);

      const id = createId();
      await env.VOICY_SHARES.put(id, body.data, {
        expirationTtl: SHARE_TTL_SECONDS,
        metadata: { createdAt: new Date().toISOString(), version: 1 },
      });

      return json({ id, expiresInDays: 30 }, 201, cors);
    }

    const match = url.pathname.match(/^\/shares\/([a-f0-9]{32})$/);
    if (match && request.method === "GET") {
      const data = await env.VOICY_SHARES.get(match[1]);
      if (!data) return json({ error: "Share not found or expired" }, 404, cors);
      return json({ data }, 200, cors);
    }

    return json({ error: "Not found" }, 404, cors || {});
  },
};
