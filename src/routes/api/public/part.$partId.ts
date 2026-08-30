import { createFileRoute } from "@tanstack/react-router";
import { getPublicDb } from "@/lib/supabase-public.server";

export const Route = createFileRoute("/api/public/part/$partId")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: { "access-control-allow-origin": "*" } }),
      GET: async ({ params, request }) => {
        const db = getPublicDb();
        const format = new URL(request.url).searchParams.get("format") ?? "txt";
        const { data: part } = await db
          .from("story_parts")
          .select("*")
          .eq("id", params.partId)
          .maybeSingle();
        if (!part) {
          return new Response("part not found", {
            status: 404,
            headers: { "access-control-allow-origin": "*" },
          });
        }
        const { data: story } = await db
          .from("stories")
          .select("title, author_name")
          .eq("id", part.story_id)
          .maybeSingle();
        const { data: chunks } = await db
          .from("story_chunks")
          .select("content, chunk_index")
          .eq("part_id", part.id)
          .order("chunk_index");
        const text = (chunks ?? [])
          .map((c) => c.content)
          .filter(Boolean)
          .join("\n\n");

        if (format === "json") {
          return new Response(
            JSON.stringify({
              story_title: story?.title,
              author: story?.author_name,
              part_number: part.part_number,
              part_title: part.title,
              status: part.status,
              word_count: part.word_count,
              text,
            }),
            {
              headers: {
                "content-type": "application/json; charset=utf-8",
                "access-control-allow-origin": "*",
              },
            },
          );
        }

        return new Response(text, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
