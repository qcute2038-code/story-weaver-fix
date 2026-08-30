import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { addNextPart } from "@/lib/stories.functions";
import { useStoryWriter } from "@/lib/useStoryWriter";
import { WORDS_TARGET } from "@/lib/story-rules";

export const Route = createFileRoute("/story/$storyId")({
  head: () => ({
    meta: [
      { title: "हिंदी मंगा कहानी पढ़िए और डाउनलोड कीजिए | मंगाकथा" },
      {
        name: "description",
        content:
          "पूरी हिंदी मंगा कहानी यहीं पढ़िए, टेक्स्ट फाइल डाउनलोड कीजिए और चाहें तो अगला पार्ट लिखवाइए।",
      },
      { property: "og:title", content: "हिंदी मंगा कहानी | मंगाकथा" },
      {
        property: "og:description",
        content: "कैजुअल हिंदी में लंबी मंगा कहानी, खुला अंत और अगला पार्ट कभी भी।",
      },
    ],
  }),
  component: StoryPage,
});

type Part = {
  id: string;
  part_number: number;
  title: string;
  status: string;
  word_count: number;
};

function StoryPage() {
  const { storyId } = Route.useParams();
  const qc = useQueryClient();
  const [activePartId, setActivePartId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["story", storyId],
    queryFn: async () => {
      const { data: story, error } = await supabase
        .from("stories")
        .select("id, title, author_name, summary")
        .eq("id", storyId)
        .single();
      if (error) throw new Error(error.message);
      const { data: parts } = await supabase
        .from("story_parts")
        .select("id, part_number, title, status, word_count")
        .eq("story_id", storyId)
        .order("part_number");
      return { story, parts: (parts ?? []) as Part[] };
    },
    refetchInterval: 8000,
  });

  const parts = useMemo(() => data?.parts ?? [], [data]);
  const current = useMemo(
    () => parts.find((p) => p.id === activePartId) ?? parts[parts.length - 1] ?? null,
    [parts, activePartId],
  );

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["story", storyId] });
    qc.invalidateQueries({ queryKey: ["part-text", current?.id] });
  }, [qc, storyId, current?.id]);

  const { state, run, stop } = useStoryWriter(current?.id ?? null, refresh);

  // Auto start writing whenever the newest part is not finished yet.
  useEffect(() => {
    if (!current) return;
    if (current.status !== "complete" && !state.running) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.status]);

  const { data: text } = useQuery({
    queryKey: ["part-text", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data: chunks } = await supabase
        .from("story_chunks")
        .select("content, chunk_index")
        .eq("part_id", current!.id)
        .order("chunk_index");
      return (chunks ?? [])
        .map((c) => c.content)
        .filter(Boolean)
        .join("\n\n");
    },
    refetchInterval: current?.status === "complete" ? false : 10000,
  });

  const nextPart = async () => {
    try {
      const res = await addNextPart({ data: { storyId } });
      toast.success(`भाग ${res.partNumber} शुरू हो गया`);
      setActivePartId(res.partId);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "नया पार्ट नहीं बना");
    }
  };

  if (!data) {
    return <main className="mx-auto max-w-4xl px-4 py-16 text-muted-foreground">लोड हो रहा है</main>;
  }

  const words = current?.word_count || state.words;
  const pct = Math.min(100, Math.round((words / WORDS_TARGET) * 100));
  const done = current?.status === "complete";

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="panel rounded-md bg-card p-6">
        <h1 className="ink-title text-3xl text-foreground sm:text-5xl">{data.story.title}</h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {data.story.author_name}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {parts.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePartId(p.id)}
              className={`rounded-sm border-2 border-foreground px-3 py-1 text-sm font-bold ${
                current?.id === p.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              भाग {p.part_number}
            </button>
          ))}
        </div>

        {current && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
              <span>{done ? "कहानी पूरी हो गई" : state.phase}</span>
              <span>
                {words.toLocaleString("hi-IN")} शब्द · लक्ष्य{" "}
                {WORDS_TARGET.toLocaleString("hi-IN")}
              </span>
            </div>
            <Progress value={pct} className="mt-2 h-3 border-2 border-foreground" />
            {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {!done &&
                (state.running ? (
                  <Button
                    variant="outline"
                    className="border-2 border-foreground font-bold"
                    onClick={stop}
                  >
                    रोकें
                  </Button>
                ) : (
                  <Button className="border-2 border-foreground font-bold" onClick={() => void run()}>
                    लिखना जारी रखें
                  </Button>
                ))}
              <Button asChild variant="secondary" className="border-2 border-foreground font-bold">
                <a href={`/api/public/part/${current.id}?format=txt`}>टेक्स्ट डाउनलोड</a>
              </Button>
              <Button asChild variant="outline" className="border-2 border-foreground font-bold">
                <Link to="/library">लाइब्रेरी</Link>
              </Button>
            </div>
          </div>
        )}
      </div>

      {done && (
        <div className="panel mt-6 rounded-md bg-secondary p-6 text-center">
          <h2 className="ink-title text-2xl text-foreground">
            भाग {current?.part_number} खत्म। पार्ट {(current?.part_number ?? 1) + 1} चाहिए?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            अगला पार्ट इसी दुनिया और इन्हीं किरदारों को आगे बढ़ाएगा।
          </p>
          <Button className="mt-4 border-2 border-foreground font-bold" onClick={nextPart}>
            हाँ, अगला पार्ट लिखो
          </Button>
        </div>
      )}

      <section className="panel mt-6 rounded-md bg-card p-6">
        <h2 className="ink-title text-2xl text-foreground">
          {current?.title || "कहानी"}
        </h2>
        <div className="story-prose mt-4 whitespace-pre-wrap text-lg leading-relaxed text-foreground">
          {text || "अभी लिखाई शुरू हो रही है।"}
        </div>
      </section>
    </main>
  );
}
