import { createFileRoute } from "@tanstack/react-router";
import { getPublicDb } from "@/lib/supabase-public.server";

const cors = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
};

export const Route = createFileRoute("/api/public/story/$storyId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ params, request }) => {
        const db = getPublicDb();
        const includeText = new URL(request.url).searchParams.get("text") === "true";
        const { data: story } = await db
          .from("stories")
          .select("*")
          .eq("id", params.storyId)
          .maybeSingle();
        if (!story) {
          return new Response(JSON.stringify({ error: "story not found" }), {
            status: 404,
            headers: cors,
          });
        }
        const { data: parts } = await db
          .from("story_parts")
          .select("id, part_number, title, status, word_count")
          .eq("story_id", story.id)
          .order("part_number");

        const result = [];
        for (const p of parts ?? []) {
          let text: string | undefined;
          if (includeText) {
            const { data: chunks } = await db
              .from("story_chunks")
              .select("content, chunk_index")
              .eq("part_id", p.id)
              .order("chunk_index");
            text = (chunks ?? [])
              .map((c) => c.content)
              .filter(Boolean)
              .join("\n\n");
          }
          result.push({ ...p, text_url: `/api/public/part/${p.id}`, ...(text ? { text } : {}) });
        }

        return new Response(JSON.stringify({ story, parts: result }), { headers: cors });
      },
    },
  },
});
