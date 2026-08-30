import { createFileRoute } from "@tanstack/react-router";
import { getPublicDb } from "@/lib/supabase-public.server";

const cors = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
};

export const Route = createFileRoute("/api/public/library")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () => {
        const db = getPublicDb();
        const { data: stories, error } = await db
          .from("stories")
          .select("id, title, author_name, summary, created_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: cors,
          });
        }
        const { data: parts } = await db
          .from("story_parts")
          .select("id, story_id, part_number, title, status, word_count")
          .order("part_number");

        const payload = (stories ?? []).map((s) => ({
          ...s,
          parts: (parts ?? [])
            .filter((p) => p.story_id === s.id)
            .map((p) => ({
              id: p.id,
              part_number: p.part_number,
              title: p.title,
              status: p.status,
              word_count: p.word_count,
              text_url: `/api/public/part/${p.id}`,
            })),
        }));

        return new Response(JSON.stringify({ count: payload.length, stories: payload }), {
          headers: cors,
        });
      },
    },
  },
});
