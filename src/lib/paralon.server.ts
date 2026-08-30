// Server-only helpers for the Paralon Cloud free model.
//
// Everything here is built around three facts about the provider:
//  1. Only ParalonCloud's currently listed free 27B Qwen model may be used.
//  2. Each key allows sixty requests per minute, so four keys are rotated.
//  3. The hosted model always runs its internal thinking pass. We ask it to skip
//     thinking AND we throw away every reasoning token, so thinking never shows
//     up in a story and never eats into the visible answer.

const BASE_URL = "https://paraloncloud.com/v1/chat/completions";
// The supplied free-tier accounts expose this exact id in their /v1/models catalog.
// Keep this fixed: these accounts have no paid credits and must never fall back.
export const MODEL = "qwen3.8-27b";

// Free-tier guard rails.
const RATE_LIMIT_PER_KEY_PER_MIN = 55;
const STALL_MS = 25_000; // no new visible answer text for this long => retry on another key
const HARD_TIMEOUT_MS = 85_000;

export function getKeys(): string[] {
  const keys = [
    process.env["PARALONCLOUD_API_KEY_1"],
    process.env["PARALONCLOUD_API_KEY_2"],
    process.env["PARALONCLOUD_API_KEY_3"],
    process.env["PARALONCLOUD_API_KEY_4"],
  ].filter(
    (k): k is string =>
      typeof k === "string" && /^prlc_[a-f0-9]{48}$/i.test(k.trim()),
  );
  if (keys.length === 0) throw new Error("ParalonCloud API keys are not configured");
  return keys;
}

// Simple in-process sliding window so parallel writers never trip the free limit.
const hits = new Map<string, number[]>();

async function waitForSlot(key: string) {
  for (let i = 0; i < 120; i++) {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length < RATE_LIMIT_PER_KEY_PER_MIN) {
      recent.push(now);
      hits.set(key, recent);
      return;
    }
    hits.set(key, recent);
    await sleep(1000);
  }
  throw new Error("ParalonCloud free-tier rate limit wait timed out");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type StreamResult = { text: string; finished: boolean };

async function completeOnce(key: string, body: Record<string, unknown>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HARD_TIMEOUT_MS);
  try {
    const messages = Array.isArray(body["messages"])
      ? body["messages"].map((message, index, all) => {
          if (
            index !== all.length - 1 ||
            !message ||
            typeof message !== "object" ||
            !("role" in message) ||
            !("content" in message) ||
            message.role !== "user" ||
            typeof message.content !== "string"
          ) {
            return message;
          }
          return { ...message, content: `${message.content}\n\n/no_think` };
        })
      : body["messages"];
    const res = await fetch(BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...body,
        messages,
        model: MODEL,
        stream: false,
        enable_thinking: false,
        chat_template_kwargs: { enable_thinking: false, thinking: false },
      }),
    });
    if (!res.ok) {
      const err = new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return payload.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// One streaming call. Streaming is what keeps long chapters from hanging: bytes
// arrive within a few seconds, so neither the host nor the browser gives up, and
// a genuinely frozen generation is detected by the stall timer instead of by a
// five minute silence.
async function streamOnce(key: string, body: Record<string, unknown>): Promise<StreamResult> {
  const controller = new AbortController();
  let lastContent = Date.now();
  const started = Date.now();
  const watchdog = setInterval(() => {
    // Qwen may still emit hidden reasoning even when thinking is disabled. Those
    // bytes are not useful output and must not keep a stalled request alive.
    if (Date.now() - lastContent > STALL_MS || Date.now() - started > HARD_TIMEOUT_MS) {
      controller.abort();
    }
  }, 2000);

  try {
    const messages = Array.isArray(body["messages"])
      ? body["messages"].map((message, index, all) => {
          if (
            index !== all.length - 1 ||
            !message ||
            typeof message !== "object" ||
            !("role" in message) ||
            !("content" in message) ||
            message.role !== "user" ||
            typeof message.content !== "string"
          ) {
            return message;
          }
          return { ...message, content: `${message.content}\n\n/no_think` };
        })
      : body["messages"];

    const res = await fetch(BASE_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        ...body,
        messages,
        model: MODEL,
        stream: true,
        enable_thinking: false,
        chat_template_kwargs: { enable_thinking: false, thinking: false },
      }),
    });

    if (!res.ok || !res.body) {
      const detail = res.ok ? "no stream body" : (await res.text()).slice(0, 300);
      const err = new Error(`${res.status} ${detail}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";
    let finished = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          if (payload === "[DONE]") finished = true;
          continue;
        }
        let parsed: {
          choices?: Array<{
            delta?: { content?: string | null; reasoning?: string | null };
            message?: { content?: string | null };
            finish_reason?: string | null;
          }>;
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const choice = parsed.choices?.[0];
        if (!choice) continue;
        // Hidden reasoning is dropped, but it still proves the provider is alive.
        // Without this, Qwen's internal pass was mistaken for a frozen request.
        if (choice.delta?.reasoning) lastContent = Date.now();
        const piece = choice.delta?.content ?? choice.message?.content ?? "";
        if (piece) {
          out += piece;
          lastContent = Date.now();
        }
        if (choice.finish_reason) finished = true;
      }
    }

    return { text: out, finished };
  } finally {
    clearInterval(watchdog);
  }
}

export async function chat(opts: {
  messages: ChatMessage[];
  keyIndex?: number;
  maxTokens?: number;
  temperature?: number;
  minChars?: number;
  stream?: boolean;
}): Promise<string> {
  const keys = getKeys();
  const start = Math.abs(opts.keyIndex ?? 0) % keys.length;
  const minChars = opts.minChars ?? 1;
  let lastError = "";
  let best = "";

  for (let attempt = 0; attempt < keys.length + 2; attempt++) {
    const key = keys[(start + attempt) % keys.length]!;
    try {
      await waitForSlot(key);
      const body = {
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 4000,
        temperature: opts.temperature ?? 0.9,
        // Belt and braces: ask the server template to skip the thinking pass.
        chat_template_kwargs: { enable_thinking: false, thinking: false },
      };
      const text =
        opts.stream === false ? await completeOnce(key, body) : (await streamOnce(key, body)).text;
      const clean = text.trim();
      if (clean.length > best.length) best = clean;
      if (clean.length >= minChars) return clean;
      lastError = `short response (${clean.length} chars)`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const status = (err as Error & { status?: number }).status;
      if (status === 429) await sleep(2500 + attempt * 1500);
      else if (status !== 400 && status !== 401 && status !== 403) await sleep(600);
    }
  }

  // A slightly short but usable answer beats failing the whole chapter.
  if (best.length >= Math.floor(minChars * 0.5) && best.length > 400) return best;
  throw new Error("AI request failed: " + lastError);
}

const DEVANAGARI_DIGITS = /[\u0966-\u096F]/g;

// Enforces rule eight (no symbols, emoji, numbers or stars anywhere) and cleans
// up the mechanical mistakes that used to slip through: doubled punctuation,
// spaces before a full stop, stray thinking tags and broken line spacing.
export function sanitizeStoryText(raw: string): string {
  let text = raw;
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<\/?think>/gi, "");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/```/g, "");
  text = text.replace(DEVANAGARI_DIGITS, "");
  text = text.replace(/[0-9]/g, "");
  text = text.replace(/[A-Za-z]/g, "");
  // strip emoji and pictographs
  text = text.replace(
    /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FE0F}\u{2600}-\u{27BF}\u{200D}]/gu,
    "",
  );
  text = text.replace(/[*#_`~^<>{}[\]|\\/@$%&+=•·◆■□●○★☆✦]/g, "");
  text = text.replace(/[“”„«»"]/g, "");
  text = text.replace(/[‘’']/g, "");
  text = text.replace(/[–—]/g, "-");

  // punctuation hygiene
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\s+([।,?!:;])/g, "$1");
  text = text.replace(/।{2,}/g, "।");
  text = text.replace(/([?!]){3,}/g, "$1$1");
  text = text.replace(/,{2,}/g, ",");
  text = text.replace(/\.{3,}/g, "...");
  text = text.replace(/([।,?!:;])(?=[^\s\n।,?!:;)])/g, "$1 ");
  text = text.replace(/\s+-\s+/g, " - ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
  return text.trim();
}
