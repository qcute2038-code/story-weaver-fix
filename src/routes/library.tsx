import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { addNextPart, deleteStory, updateStoryMeta } from "@/lib/stories.functions";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "मंगा लाइब्रेरी | सारी हिंदी कहानियाँ" },
      {
        name: "description",
        content:
          "सारी हिंदी मंगा कहानियाँ एक जगह। पढ़िए, डाउनलोड कीजिए, बदलिए, हटाइए या अगला पार्ट लिखवाइए।",
      },
      { property: "og:title", content: "मंगा लाइब्रेरी | सारी हिंदी कहानियाँ" },
      {
        property: "og:description",
        content: "खुली हिंदी मंगा लाइब्रेरी, सबके लिए मुफ्त डाउनलोड।",
      },
    ],
  }),
  component: Library,
});

type Row = {
  id: string;
  title: string;
  author_name: string;
  summary: string;
  created_at: string;
  parts: { id: string; part_number: number; status: string; word_count: number }[];
};

async function loadLibrary(): Promise<Row[]> {
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id, title, author_name, summary, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { data: parts } = await supabase
    .from("story_parts")
    .select("id, story_id, part_number, status, word_count")
    .order("part_number");
  return (stories ?? []).map((s) => ({
    ...s,
    parts: (parts ?? []).filter((p) => p.story_id === s.id),
  }));
}

function Library() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["library"], queryFn: loadLibrary });
  const [editing, setEditing] = useState<Row | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["library"] });

  const openEdit = (row: Row) => {
    setEditing(row);
    setTitle(row.title);
    setAuthor(row.author_name);
    setSummary(row.summary);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateStoryMeta({ data: { storyId: editing.id, title, author, summary } });
      toast.success("बदलाव सेव हो गए");
      setEditing(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "सेव नहीं हुआ");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: Row) => {
    if (!window.confirm("यह कहानी हमेशा के लिए हट जाएगी। हटाएँ?")) return;
    try {
      await deleteStory({ data: { storyId: row.id } });
      toast.success("कहानी हटा दी गई");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "हट नहीं पाई");
    }
  };

  const nextPart = async (row: Row) => {
    try {
      const res = await addNextPart({ data: { storyId: row.id } });
      toast.success(`भाग ${res.partNumber} शुरू हो गया`);
      navigate({ to: "/story/$storyId", params: { storyId: row.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "नया पार्ट नहीं बना");
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="ink-title text-4xl text-foreground sm:text-5xl">लाइब्रेरी</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        सारी कहानियाँ सबके लिए खुली हैं। कोई भी पढ़ सकता है और डाउनलोड कर सकता है।
      </p>

      {isLoading && <p className="mt-8 text-muted-foreground">लोड हो रहा है</p>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="panel mt-8 rounded-md bg-card p-8 text-center">
          <p className="text-muted-foreground">अभी कोई कहानी नहीं है।</p>
          <Button asChild className="mt-4 border-2 border-foreground font-bold">
            <Link to="/">पहली कहानी लिखवाइए</Link>
          </Button>
        </div>
      )}

      <div className="mt-8 space-y-4">
        {(data ?? []).map((row) => {
          const words = row.parts.reduce((s, p) => s + p.word_count, 0);
          return (
            <article key={row.id} className="panel rounded-md bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="ink-title text-2xl text-foreground">{row.title}</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {row.author_name} · {row.parts.length} भाग · {words.toLocaleString("hi-IN")} शब्द
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" className="border-2 border-foreground font-bold">
                    <Link to="/story/$storyId" params={{ storyId: row.id }}>
                      खोलें
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-2 border-foreground font-bold"
                    onClick={() => nextPart(row)}
                  >
                    अगला पार्ट
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-2 border-foreground font-bold"
                    onClick={() => openEdit(row)}
                  >
                    बदलें
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="border-2 border-foreground font-bold"
                    onClick={() => remove(row)}
                  >
                    हटाएँ
                  </Button>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{row.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {row.parts.map((p) => (
                  <a
                    key={p.id}
                    href={`/api/public/part/${p.id}?format=txt`}
                    className="rounded-sm border-2 border-foreground bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground"
                  >
                    भाग {p.part_number} ·{" "}
                    {p.status === "complete" ? "पूरा" : p.status === "writing" ? "लिखा जा रहा" : "प्लान"}{" "}
                    · डाउनलोड
                  </a>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="border-2 border-foreground">
          <DialogHeader>
            <DialogTitle className="ink-title text-2xl">कहानी बदलें</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="शीर्षक"
              className="border-2 border-foreground"
            />
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="लेखक"
              className="border-2 border-foreground"
            />
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={8}
              placeholder="सारांश"
              className="border-2 border-foreground"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={saveEdit}
              disabled={busy}
              className="border-2 border-foreground font-bold"
            >
              सेव करें
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
