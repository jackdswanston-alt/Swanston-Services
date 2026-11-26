// Cloudflare Pages ignores anything under functions/ whose name starts with an
// underscore when it builds routes, so shared code lives there rather than at
// the repo root where Pages would happily serve it as a static file.
import { readJob } from "../_shared/read-job-core.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const body = await request.json().catch(() => ({}));
  const out = await readJob(body, bearer, env);
  return new Response(JSON.stringify(out.body), {
    status: out.status, headers: { "content-type": "application/json" }
  });
}
