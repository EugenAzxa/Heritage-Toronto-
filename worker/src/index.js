/* ============================================================
   Heritage voices  |  Cloudflare Worker proxy
   ------------------------------------------------------------
   Holds ANTHROPIC_API_KEY server-side and streams Claude's
   reply back to the static site as Server-Sent Events.

   POST /chat      { persona?: "albert", messages: [{ role, content }] }
   GET  /personas  the ids this Worker will answer for
   GET  /health
   ============================================================ */

import Anthropic from "@anthropic-ai/sdk";
import { PERSONAS, isPersona } from "./personas.js";

const DEFAULT_PERSONA = "albert";

const MODEL = "claude-opus-5";

/* Guard rails on what the browser is allowed to send us. */
const MAX_TURNS = 16; // most recent messages kept
const MAX_CHARS_PER_MESSAGE = 600;
const MAX_TOTAL_CHARS = 8000;

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // No allowlist configured means local development: reflect the origin.
  const ok = allowed.length === 0 || allowed.includes(origin);

  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/* Normalise and clamp the conversation the browser sent. */
function sanitiseMessages(raw) {
  if (!Array.isArray(raw)) return { error: "messages must be an array" };

  const cleaned = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = typeof m.content === "string" ? m.content.trim() : "";
    if (!content) continue;
    cleaned.push({ role, content: content.slice(0, MAX_CHARS_PER_MESSAGE) });
  }

  // Keep only the most recent turns, and make sure we start on a user turn.
  let trimmed = cleaned.slice(-MAX_TURNS);
  while (trimmed.length && trimmed[0].role !== "user") trimmed = trimmed.slice(1);

  if (!trimmed.length) return { error: "no usable messages" };
  if (trimmed[trimmed.length - 1].role !== "user") {
    return { error: "conversation must end with a user message" };
  }

  const total = trimmed.reduce((n, m) => n + m.content.length, 0);
  if (total > MAX_TOTAL_CHARS) return { error: "conversation too long" };

  return { messages: trimmed };
}

async function checkRateLimit(request, env) {
  // Optional binding. Absent on a first deploy, which is fine.
  if (!env.RATE_LIMITER) return true;
  const ip = request.headers.get("CF-Connecting-IP") || "anonymous";
  try {
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    return success;
  } catch {
    return true; // never fail the request because rate limiting broke
  }
}

async function handleChat(request, env, cors) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Worker is missing ANTHROPIC_API_KEY." }, 500, cors);
  }

  if (!(await checkRateLimit(request, env))) {
    return json(
      { error: "This voice needs a moment. Please wait before asking again." },
      429,
      cors
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400, cors);
  }

  /* Only the five curated plaque voices and Albert exist. An unknown
     id is rejected rather than quietly falling back, so a typo on the
     client shows up as a typo instead of Albert answering for someone
     else. */
  const personaId = typeof body.persona === "string" ? body.persona : DEFAULT_PERSONA;
  if (!isPersona(personaId)) {
    return json({ error: `Unknown voice "${personaId}".` }, 400, cors);
  }
  const persona = PERSONAS[personaId];

  const { messages, error } = sanitiseMessages(body.messages);
  if (error) return json({ error }, 400, cors);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const send = (event, data) =>
    writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

  (async () => {
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 2048,
        // Thinking is on by default on Opus 5. Low effort keeps the
        // conversation snappy while leaving room for a considered reply.
        output_config: { effort: "low" },
        // Opus 5 safety classifiers can decline; let the API re-serve the
        // turn on the recommended fallback model rather than dead-ending.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Each voice gets its own cache entry, so a busy plaque stays
        // cheap on every turn after the first.
        system: [
          {
            type: "text",
            text: persona.prompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
      });

      stream.on("text", (delta) => {
        send("delta", { text: delta });
      });

      const final = await stream.finalMessage();

      if (final.stop_reason === "refusal") {
        await send("error", {
          message:
            "I would rather not speak to that. Ask me something about my own life and I will answer gladly.",
        });
      } else {
        await send("done", {
          stop_reason: final.stop_reason,
          model: final.model,
        });
      }
    } catch (err) {
      const status = err?.status;
      const message =
        status === 429
          ? `${persona.name} is being asked a great many questions just now. Try again shortly.`
          : `Something went wrong reaching ${persona.name}. Please try again.`;
      await send("error", { message, status: status ?? null });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...cors,
    },
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, model: MODEL, configured: Boolean(env.ANTHROPIC_API_KEY) }, 200, cors);
    }

    // Metadata only. The prompts themselves never leave the Worker.
    if (url.pathname === "/personas") {
      return json(
        {
          personas: Object.values(PERSONAS).map(({ id, name, dates, role, plaques }) => ({
            id,
            name,
            dates: dates ?? null,
            role: role ?? null,
            plaques,
          })),
        },
        200,
        cors
      );
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      return handleChat(request, env, cors);
    }

    return json({ error: "Not found." }, 404, cors);
  },
};
