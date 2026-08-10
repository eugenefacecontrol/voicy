const ALLOWED_ORIGINS = new Set([
  "https://eugenefacecontrol.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const MAX_PAYLOAD_LENGTH = 1_500_000;
const SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;
const FISH_API_URL = "https://api.fish.audio";
const FISH_MODEL = "s2.1-pro-free";
const MAX_TTS_TEXT_LENGTH = 2_000;

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

function fishHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.FISH_API_KEY}`,
    ...extra,
  };
}

async function fishCredit(env) {
  if (!env.FISH_API_KEY) return { enabled: false, available: false };

  const response = await fetch(`${FISH_API_URL}/wallet/self/api-credit?check_free_credit=true`, {
    headers: fishHeaders(env),
  });
  if (!response.ok) return { enabled: false, available: false };

  const credit = await response.json();
  const paidCredit = Number(credit.credit) || 0;
  return {
    enabled: true,
    available: true,
    credit: paidCredit,
    hasFreeCredit: credit.has_free_credit === true,
    freeModel: true,
    model: FISH_MODEL,
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
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

    if (url.pathname === "/fish/status" && request.method === "GET") {
      try {
        return json(await fishCredit(env), 200, cors);
      } catch {
        return json({ enabled: true, available: false, error: "Fish Audio unavailable" }, 503, cors);
      }
    }

    if (url.pathname === "/fish/voices" && request.method === "GET") {
      const access = await fishCredit(env);
      if (!access.available) return json({ items: [], available: false }, 200, cors);

      const fishUrl = new URL(`${FISH_API_URL}/model`);
      fishUrl.searchParams.set("page_size", "50");
      fishUrl.searchParams.set("page_number", "1");
      fishUrl.searchParams.set("sort_by", "task_count");
      const query = url.searchParams.get("q")?.trim().slice(0, 80);
      if (query) fishUrl.searchParams.set("title", query);
      else fishUrl.searchParams.set("language", "ru");

      const response = await fetch(fishUrl, { headers: fishHeaders(env) });
      if (!response.ok) return json({ error: "Не удалось загрузить голоса Fish Audio" }, response.status, cors);
      const result = await response.json();
      const items = (result.items || [])
        .filter((item) => item._id && item.title && !item.dmca_taken_down && item.visibility !== "private")
        .map((item) => ({
          id: item._id,
          title: item.title,
          languages: item.languages || [],
          author: item.author?.nickname || "Fish Audio",
          coverImage: item.cover_image || "",
        }));
      return json({ items, total: result.total || items.length, available: true }, 200, cors);
    }

    if (url.pathname === "/fish/tts" && request.method === "POST") {
      const access = await fishCredit(env);
      if (!access.available) return json({ error: "Бесплатный кредит Fish Audio недоступен" }, 402, cors);

      const body = await readJson(request);
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      const referenceId = typeof body?.referenceId === "string" ? body.referenceId : "";
      if (!text || text.length > MAX_TTS_TEXT_LENGTH) return json({ error: "Некорректная длина текста" }, 400, cors);
      if (!/^[a-f0-9]{32}$/i.test(referenceId)) return json({ error: "Некорректный голос Fish Audio" }, 400, cors);

      const response = await fetch(`${FISH_API_URL}/v1/tts`, {
        method: "POST",
        headers: fishHeaders(env, {
          "Content-Type": "application/json",
          model: FISH_MODEL,
        }),
        body: JSON.stringify({ text, reference_id: referenceId, format: "mp3", normalize: true }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return json({ error: error.message || "Fish Audio не сгенерировал аудио" }, response.status, cors);
      }

      return new Response(response.body, {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (url.pathname === "/shares" && request.method === "POST") {
      const contentLength = Number(request.headers.get("Content-Length") || 0);
      if (contentLength > MAX_PAYLOAD_LENGTH * 1.4) return json({ error: "Payload too large" }, 413, cors);

      const body = await readJson(request);
      if (!body) return json({ error: "Invalid JSON" }, 400, cors);

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
