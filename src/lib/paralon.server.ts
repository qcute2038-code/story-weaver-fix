// Server-only helpers for the Paralon Cloud free model.
//
// Rules of this provider:
//  1. Only the free 27B Qwen model may be used (no credits on these accounts).
//  2. Each key allows sixty requests per minute, so all four keys are rotated.
//  3. Thinking is disabled in the request body, and any reasoning that still
//     arrives is dropped rather than shown or stored.

const BASE_URL = "https://paraloncloud.com/v1/chat/completions";
export const MODEL = "qwen3.8-27b";

const RATE_LIMIT_PER_KEY_PER_MIN = 55;

export function getKeys(): string[] {
  const raw = [
    process.env["PARALON_API_KEY_1"] ?? process.env["PARALONCLOUD_API_KEY_1"],
    process.env["PARALON_API_KEY_2"] ?? process.env["PARALONCLOUD_API_KEY_2"],
    process.env["PARALON_API_KEY_3"] ?? process.env["PARALONCLOUD_API_KEY_3"],
    process.env["PARALON_API_KEY_4"] ?? process.env["PARALONCLOUD_API_KEY_4"],
  ];
  const keys = raw
    .map((k) => (typeof k === "string" ? k.trim() : ""))
    .filter((k) => k.startsWith("prlc_"));
  if (keys.length === 0) throw new Error("ParalonCloud API keys are not configured");
  return keys;
}

// Sliding window so parallel writers never trip the free limit.
const hits = new Map<string, number[]>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Keep the provider-specific thinking switch in exactly one place.
function buildBody(
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; stream: boolean },
) {
  return {
    model: MODEL,
    messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    stream: opts.stream,
    chat_template_kwargs: { enable_thinking: false },
  };
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "");
}

async function completeOnce(key: string, body: ReturnType<typeof buildBody>): Promise<string> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return stripThinking(payload.choices?.[0]?.message?.content ?? "");
}

// Streaming keeps long generations active without imposing an artificial
// deadline that could discard valid, billable work still running upstream.
async function streamOnce(key: string, body: ReturnType<typeof buildBody>): Promise<string> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
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

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload) as {
        choices?: Array<{
          delta?: { content?: string | null; reasoning?: string | null };
          message?: { content?: string | null };
        }>;
      };
      const choice = parsed.choices?.[0];
      if (!choice) return;
      out += choice.delta?.content ?? choice.message?.content ?? "";
    } catch {
      // Ignore keep-alives and non-JSON provider events.
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    lines.forEach(consumeLine);
  }
  buffer += decoder.decode();
  if (buffer) consumeLine(buffer);

  return stripThinking(out);
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
    const key = keys[(start + attempt) % keys.length];
    if (!key) continue;
    try {
      await waitForSlot(key);
      const useStream = opts.stream !== false;
      const body = buildBody(opts.messages, {
        maxTokens: opts.maxTokens ?? 4000,
        temperature: opts.temperature ?? 0.9,
        stream: useStream,
      });
      const text = useStream ? await streamOnce(key, body) : await completeOnce(key, body);
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
