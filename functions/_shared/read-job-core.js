/* Shared handler for the AI job reader. Each host wraps this.
   The Anthropic key never leaves the server. */

// Model IDs change. Set ANTHROPIC_MODEL in your host's env rather than
// editing this file. Current IDs: https://docs.claude.com/en/docs/about-claude/models
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Turn a data: URL into the shape the Anthropic API wants.
function toImageBlock(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const mediaType = m[1].toLowerCase();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) return null;
  if (m[2].length * 0.75 > MAX_IMAGE_BYTES) return null;
  return { type: "image", source: { type: "base64", media_type: mediaType, data: m[2] } };
}

/**
 * @param {object} body    parsed request body { prompt, images }
 * @param {string} bearer  the caller's Supabase access token
 * @param {object} env     { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY }
 * @returns {{status:number, body:object}}
 */
export async function readJob(body, bearer, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return { status: 500, body: { error: "ANTHROPIC_API_KEY is not set on the server" } };
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { status: 500, body: { error: "Supabase env vars are not set on the server" } };
  }

  // --- who is calling? only a signed-in user may spend the credits ---
  if (!bearer) return { status: 401, body: { error: "not signed in" } };
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const who = await fetch(base + "/auth/v1/user", {
    headers: { authorization: "Bearer " + bearer, apikey: env.SUPABASE_ANON_KEY }
  });
  if (!who.ok) return { status: 403, body: { error: "session not valid" } };

  // a signed-in user could otherwise loop this and run up the bill
  const quota = await fetch(base + "/rest/v1/rpc/claim_ai_call", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + bearer,
      apikey: env.SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ p_max_per_hour: Number(env.AI_CALLS_PER_HOUR || 30) })
  });
  if (!quota.ok) return { status: 502, body: { error: "could not check the usage limit" } };
  if ((await quota.text()).trim() !== "true") {
    return { status: 429, body: { error: "Too many photo reads this hour. Try again later." } };
  }

  const prompt = String(body && body.prompt || "").slice(0, 20000);
  if (!prompt) return { status: 400, body: { error: "no prompt" } };

  const images = (Array.isArray(body.images) ? body.images : [])
    .slice(0, MAX_IMAGES).map(toImageBlock).filter(Boolean);

  const content = images.concat([{ type: "text", text: prompt }]);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content }]
    })
  });

  if (!r.ok) {
    const detail = await r.text();
    return {
      status: r.status === 429 ? 429 : 502,
      body: { error: "model call failed", detail: detail.slice(0, 500) }
    };
  }

  const data = await r.json();
  const text = (data.content || [])
    .filter(function (b) { return b.type === "text"; })
    .map(function (b) { return b.text; })
    .join("");

  // the quote builder asks for JSON, so parse it here when we can
  let parsed = null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  try { parsed = JSON.parse(candidate.trim()); } catch (e) { parsed = null; }

  return { status: 200, body: { text: text, json: parsed } };
}
