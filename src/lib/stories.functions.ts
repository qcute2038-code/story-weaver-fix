import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const createStory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ summary: z.string().min(30), author: z.string().max(60).optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getPublicDb } = await import("./supabase-public.server");
    const db = getPublicDb();
    const { data: story, error } = await db
      .from("stories")
      .insert({ summary: data.summary, author_name: data.author?.trim() || "Anonymous" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const { data: part, error: pe } = await db
      .from("story_parts")
      .insert({ story_id: story.id, part_number: 1, status: "planning" })
      .select()
      .single();
    if (pe) throw new Error(pe.message);
    return { storyId: story.id, partId: part.id };
  });

export const addNextPart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ storyId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicDb } = await import("./supabase-public.server");
    const db = getPublicDb();
    const { data: parts } = await db
      .from("story_parts")
      .select("part_number")
      .eq("story_id", data.storyId)
      .order("part_number", { ascending: false })
      .limit(1);
    const next = (parts?.[0]?.part_number ?? 0) + 1;
    const { data: part, error } = await db
      .from("story_parts")
      .insert({ story_id: data.storyId, part_number: next, status: "planning" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { partId: part.id, partNumber: next };
  });

export const planPart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { planAndSeedPart } = await import("./story-engine.server");
    return await planAndSeedPart(data.partId);
  });

export const writeStoryChunk = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ chunkId: z.string().uuid(), keyIndex: z.number().int().min(0).max(11) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { writeChunk } = await import("./story-engine.server");
    return await writeChunk(data.chunkId, data.keyIndex);
  });

export const finishPart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { finalizePart } = await import("./story-engine.server");
    return await finalizePart(data.partId);
  });

export const getPartText = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { partFullText } = await import("./story-engine.server");
    return await partFullText(data.partId);
  });

export const updateStoryMeta = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        storyId: z.string().uuid(),
        title: z.string().min(1).max(140).optional(),
        author: z.string().max(60).optional(),
        summary: z.string().min(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getPublicDb } = await import("./supabase-public.server");
    const db = getPublicDb();
    const patch: {
      updated_at: string;
      title?: string;
      author_name?: string;
      summary?: string;
    } = { updated_at: new Date().toISOString() };
    if (data.title) patch.title = data.title;
    if (data.author) patch.author_name = data.author;
    if (data.summary) patch.summary = data.summary;
    const { error } = await db.from("stories").update(patch).eq("id", data.storyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteStory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ storyId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicDb } = await import("./supabase-public.server");
    const db = getPublicDb();
    const { error } = await db.from("stories").delete().eq("id", data.storyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicDb } = await import("./supabase-public.server");
    const db = getPublicDb();
    const { error } = await db.from("story_parts").delete().eq("id", data.partId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
