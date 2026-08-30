import { chat, sanitizeStoryText } from "./paralon.server";
import { getPublicDb } from "./supabase-public.server";
import {
  BASE_CHAPTERS,
  CHAPTER_WORDS,
  MAX_CHAPTERS,
  MAX_CHUNK_ATTEMPTS,
  PLAN_BATCH,
  RULES_BLOCK,
  SYSTEM_PROMPT,
  WORDS_TARGET,
  countWords,
} from "./story-rules";

type Chapter = { title: string; brief: string };

function stripFence(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function extractJson(text: string): unknown {
  const clean = stripFence(text);
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("plan json not found");
  return JSON.parse(clean.slice(start, end + 1));
}

function normalizeTitle(text: string): string {
  return sanitizeStoryText(text).replace(/\n/g, " ").trim().slice(0, 120) || "मंगा कहानी";
}

export async function buildPlan(args: {
  summary: string;
  partNumber: number;
  previousDigest: string;
}): Promise<{ title: string; chapters: Chapter[] }> {
  const partLine =
    args.partNumber === 1
      ? "यह कहानी का पहला भाग है।"
      : `यह कहानी का भाग ${args.partNumber} है। पिछले भागों का सार नीचे दिया है, उसी दुनिया और किरदारों को आगे बढ़ाना है।\n\nपिछले भागों का सार:\n${args.previousDigest}`;

  // Step one: a short, cheap call that fixes the title, the world and the arc.
  const arcRaw = await chat({
    keyIndex: 0,
    temperature: 0.8,
    maxTokens: 1000,
    minChars: 120,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `नीचे अंग्रेजी में एक कहानी का सारांश दिया है। इसे समझकर एक लंबी हिंदी मंगा कहानी की बुनियाद तैयार करो।

${partLine}

अंग्रेजी सारांश:
${args.summary}

अब सिर्फ इतना दो:
{"title": "कहानी का छोटा हिंदी शीर्षक", "characters": "मुख्य किरदारों के हिंदी नाम और एक एक लाइन में उनका मिजाज", "arc": "पूरी कहानी का बहाव छह से आठ लाइन में, शुरू से खुले अंत तक, हिंदी में"}

जवाब सिर्फ यही जेसन हो, और कुछ नहीं।`,
      },
    ],
  });

  const arc = extractJson(arcRaw) as { title?: string; characters?: string; arc?: string };
  const title = normalizeTitle(String(arc.title ?? ""));
  const world = `किरदार: ${sanitizeStoryText(String(arc.characters ?? "")).slice(0, 1200)}
कहानी का बहाव: ${sanitizeStoryText(String(arc.arc ?? "")).slice(0, 2000)}`;

  // Step two: every key writes one slice of the chapter list at the same time,
  // so the whole plan lands in one round instead of one huge slow call.
  const batches = Math.ceil(BASE_CHAPTERS / PLAN_BATCH);
  const slices = await Promise.all(
    Array.from({ length: batches }, async (_, b) => {
      const from = b * PLAN_BATCH + 1;
      const to = Math.min(BASE_CHAPTERS, from + PLAN_BATCH - 1);
      const isLastSlice = to === BASE_CHAPTERS;
      const ask = `कहानी का नाम: ${title}

${world}

पूरी कहानी में ${BASE_CHAPTERS} अध्याय हैं। तुम्हें सिर्फ अध्याय ${from} से अध्याय ${to} तक का प्लान बनाना है, उसी बहाव के हिसाब से।
${b === 0 ? "यह शुरुआत का हिस्सा है, यहाँ पकड़ बनानी है और पहला हुक देना है।" : ""}${b === batches - 1 ? "" : "यह बीच का हिस्सा है, यहाँ मोड़, सस्पेंस, हँसी और इमोशन बढ़ाने हैं।"}
${isLastSlice ? "आखिरी अध्याय का अंत खुला रखना है, कोई पूरा समाधान नहीं।" : ""}

हर अध्याय का हिंदी शीर्षक और दो लाइन का ब्यौरा दो कि क्या होगा, कौन होगा, कौन सा मोड़ आएगा और कौन सी भावना उभरेगी।

जवाब सिर्फ इस जेसन में दो:
{"chapters": [{"title": "अध्याय का हिंदी शीर्षक", "brief": "हिंदी में ब्यौरा"}]}`;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const raw = await chat({
            keyIndex: b + attempt,
            temperature: 0.85,
            maxTokens: 1800,
            minChars: 150,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: ask },
            ],
          });
          const parsed = extractJson(raw) as { chapters?: Chapter[] };
          const list = (parsed.chapters ?? [])
            .filter((c) => c && typeof c.brief === "string")
            .map((c) => ({
              title: normalizeTitle(String(c.title ?? "")),
              brief: sanitizeStoryText(String(c.brief ?? "")).slice(0, 900),
            }));
          if (list.length > 0) return list;
        } catch (err) {
          console.error("plan slice failed", b, err);
        }
      }
      return [] as Chapter[];
    }),
  );

  const chapters = slices.flat();
  if (chapters.length < 6) throw new Error("plan too short");

  let filler = 0;
  while (chapters.length < BASE_CHAPTERS) {
    const src = chapters[filler % chapters.length];
    if (!src) throw new Error("plan has no usable chapters");
    filler += 1;
    chapters.push({
      title: src.title,
      brief: src.brief + " इस हिस्से में कहानी और गहरी होती है और नया मोड़ आता है।",
    });
  }

  return { title, chapters: chapters.slice(0, BASE_CHAPTERS) };
}

export async function planAndSeedPart(partId: string) {
  const db = getPublicDb();
  const { data: part } = await db.from("story_parts").select("*").eq("id", partId).single();
  if (!part) throw new Error("part not found");

  const { data: story } = await db.from("stories").select("*").eq("id", part.story_id).single();
  if (!story) throw new Error("story not found");

  let previousDigest = "";
  if (part.part_number > 1) {
    const { data: prevParts } = await db
      .from("story_parts")
      .select("part_number, title, plan")
      .eq("story_id", part.story_id)
      .lt("part_number", part.part_number)
      .order("part_number");
    previousDigest = (prevParts ?? [])
      .map((p) => {
        const plan = (p.plan ?? {}) as { chapters?: Chapter[] };
        const briefs = (plan.chapters ?? []).map((c) => c.brief).join(" ");
        return `भाग ${p.part_number}: ${p.title}\n${briefs}`.slice(0, 6000);
      })
      .join("\n\n");
  }

  let plan: Awaited<ReturnType<typeof buildPlan>>;
  try {
    plan = await buildPlan({
      summary: story.summary,
      partNumber: part.part_number,
      previousDigest,
    });
  } catch (error) {
    await db
      .from("story_parts")
      .update({ status: "planning", updated_at: new Date().toISOString() })
      .eq("id", partId);
    throw error;
  }

  await db.from("story_chunks").delete().eq("part_id", partId);
  const { error: insertError } = await db.from("story_chunks").insert(
    plan.chapters.map((c, i) => ({
      part_id: partId,
      chunk_index: i,
      title: c.title,
      brief: c.brief,
      status: "pending",
    })),
  );
  if (insertError) throw new Error(insertError.message);

  await db
    .from("story_parts")
    .update({
      plan: JSON.parse(JSON.stringify(plan)),
      title: plan.title,
      status: "writing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", partId);

  if (part.part_number === 1 && story.title === "नई मंगा कहानी") {
    await db.from("stories").update({ title: plan.title }).eq("id", story.id);
  }

  return { title: plan.title, chapters: plan.chapters.length };
}

export async function writeChunk(chunkId: string, keyIndex: number) {
  const db = getPublicDb();
  const { data: chunk } = await db.from("story_chunks").select("*").eq("id", chunkId).single();
  // The chunk row can vanish mid-run (replan, part deleted, story deleted).
  // That is not a failure: the next loop round just re-reads the fresh list.
  if (!chunk) return { skipped: true, status: "missing", wordCount: 0 };
  if (chunk.status === "done" && chunk.content.length > 0) {
    return { skipped: true, status: "done", wordCount: chunk.word_count };
  }

  const { data: part } = await db.from("story_parts").select("*").eq("id", chunk.part_id).single();
  if (!part) return { skipped: true, status: "missing", wordCount: 0 };

  const plan = (part.plan ?? {}) as { title?: string; chapters?: Chapter[] };
  const chapters = plan.chapters ?? [];
  const outline = chapters
    .map(
      (c, i) =>
        `${i === chunk.chunk_index ? "अभी यही लिखना है" : "आगे पीछे"}: ${c.title} - ${c.brief}`,
    )
    .slice(Math.max(0, chunk.chunk_index - 2), chunk.chunk_index + 3)
    .join("\n");

  let previousTail = "";
  if (chunk.chunk_index > 0) {
    const { data: prev } = await db
      .from("story_chunks")
      .select("content")
      .eq("part_id", chunk.part_id)
      .eq("chunk_index", chunk.chunk_index - 1)
      .maybeSingle();
    previousTail = (prev?.content ?? "").slice(-1200);
  }

  const isLast = chunk.chunk_index === chapters.length - 1;
  const attempts = (chunk.attempts ?? 0) + 1;

  const prompt = `कहानी का नाम: ${plan.title ?? part.title}
यह कहानी का भाग ${part.part_number} है।

आसपास के अध्यायों का प्लान:
${outline}

${previousTail ? `पिछले हिस्से का आखिरी अंश, इसी बहाव से आगे लिखना है:\n${previousTail}\n` : ""}
अब इस अध्याय को पूरा लिखो: ${chunk.title}
इस अध्याय में यह होना है: ${chunk.brief}

ध्यान रखो:
- लगभग ${CHAPTER_WORDS} हिंदी शब्द लिखो। इससे छोटा मत लिखो।
- खूब सारे नेचुरल संवाद डालो, हर किरदार अपने अंदाज़ में बोले।
- माहौल, चेहरे के भाव, आवाज़, डर, हँसी, दर्द सब दिखाओ।
- वर्तनी और मात्राएँ जाँच कर लिखो, व्याकरण की एक भी गलती नहीं।
- अध्याय के आखिर में एक हुक छोड़ो जिससे आगे पढ़ने का मन करे।
${isLast ? "- यह आखिरी अध्याय है, इसका अंत खुला रखना है। कोई पूरा समाधान मत दो।" : ""}

नियम दोबारा याद रखो:
${RULES_BLOCK}

 सिर्फ कहानी लिखो, कोई शीर्षक या नोट नहीं। सीधे कहानी शुरू करो।`;

  try {
    const raw = await chat({
      keyIndex,
      temperature: 0.92,
      maxTokens: 3600,
      // Roughly the character count of the asked-for chapter length; the helper
      // retries on another key when the model returns far less than this.
      minChars: Math.round(CHAPTER_WORDS * 4.2),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const content = sanitizeStoryText(raw);
    const wordCount = countWords(content);
    if (wordCount < 150) throw new Error(`chunk too short (${wordCount} words)`);

    await db
      .from("story_chunks")
      .update({
        content,
        word_count: wordCount,
        status: "done",
        attempts,
        error: "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", chunkId);

    return { skipped: false, status: "done", wordCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Never loop forever on one bad chapter: after a few tries it is parked as
    // skipped and the rest of the story keeps moving.
    const status = attempts >= MAX_CHUNK_ATTEMPTS ? "skipped" : "pending";
    await db
      .from("story_chunks")
      .update({
        attempts,
        status,
        error: message.slice(0, 400),
        updated_at: new Date().toISOString(),
      })
      .eq("id", chunkId);
    return { skipped: false, status, wordCount: 0, error: message };
  }
}

export async function finalizePart(partId: string) {
  const db = getPublicDb();
  const { data: chunks } = await db
    .from("story_chunks")
    .select("chunk_index, status, word_count, brief, title")
    .eq("part_id", partId)
    .order("chunk_index");
  const list = chunks ?? [];
  const pending = list.filter((c) => c.status === "pending");
  const total = list.reduce((sum, c) => sum + c.word_count, 0);

  if (pending.length > 0) {
    await db
      .from("story_parts")
      .update({ word_count: total, status: "writing", updated_at: new Date().toISOString() })
      .eq("id", partId);
    return { status: "writing", wordCount: total, pending: pending.length };
  }

  if (total < WORDS_TARGET && list.length < MAX_CHAPTERS) {
    const need = Math.min(
      MAX_CHAPTERS - list.length,
      Math.ceil((WORDS_TARGET - total) / CHAPTER_WORDS) + 1,
    );
    const last = list[list.length - 1];
    const extra = Array.from({ length: need }, (_, i) => ({
      part_id: partId,
      chunk_index: list.length + i,
      title: "कहानी आगे बढ़ती है",
      brief:
        (last?.brief ?? "") +
        " इस हिस्से में कहानी और आगे बढ़ती है, नया मोड़ आता है, किरदारों की भावनाएँ गहरी होती हैं और सस्पेंस बढ़ता है।",
      status: "pending",
    }));
    await db.from("story_chunks").insert(extra);
    await db
      .from("story_parts")
      .update({ word_count: total, status: "writing", updated_at: new Date().toISOString() })
      .eq("id", partId);
    return { status: "writing", wordCount: total, pending: need };
  }

  await db
    .from("story_parts")
    .update({ word_count: total, status: "complete", updated_at: new Date().toISOString() })
    .eq("id", partId);
  const { data: owner } = await db
    .from("story_parts")
    .select("story_id")
    .eq("id", partId)
    .single();
  if (owner) {
    await db
      .from("stories")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", owner.story_id);
  }

  return { status: "complete", wordCount: total, pending: 0 };
}

export async function partFullText(partId: string) {
  const db = getPublicDb();
  const { data: part } = await db.from("story_parts").select("*").eq("id", partId).single();
  if (!part) throw new Error("part not found");
  const { data: story } = await db.from("stories").select("*").eq("id", part.story_id).single();
  const { data: chunks } = await db
    .from("story_chunks")
    .select("content, chunk_index")
    .eq("part_id", partId)
    .order("chunk_index");
  const body = (chunks ?? [])
    .map((c) => c.content)
    .filter(Boolean)
    .join("\n\n");
  return {
    title: story?.title ?? part.title,
    partTitle: part.title,
    partNumber: part.part_number,
    wordCount: part.word_count,
    text: body,
  };
}
