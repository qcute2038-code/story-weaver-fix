import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createStory } from "@/lib/stories.functions";
import { WORDS_TARGET } from "@/lib/story-rules";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "नई हिंदी मंगा कहानी लिखवाइए | मंगाकथा" },
      {
        name: "description",
        content:
          "अंग्रेजी सारांश डालिए और पचास हजार से ज्यादा शब्दों की कैजुअल हिंदी मंगा कहानी बनवाइए। बिना लॉगिन, कभी भी डाउनलोड।",
      },
      { property: "og:title", content: "नई हिंदी मंगा कहानी लिखवाइए | मंगाकथा" },
      {
        property: "og:description",
        content: "सारांश से पूरी हिंदी मंगा कहानी, लाइब्रेरी में सेव और खुला डाउनलोड।",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (summary.trim().length < 30) {
      toast.error("सारांश थोड़ा और लंबा लिखिए");
      return;
    }
    setBusy(true);
    try {
      const res = await createStory({ data: { summary: summary.trim(), author: author.trim() } });
      toast.success("कहानी बन रही है");
      navigate({ to: "/story/$storyId", params: { storyId: res.storyId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "कुछ गड़बड़ हुई");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="panel rounded-md bg-card p-6 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          हिंदी मंगा स्टूडियो
        </p>
        <h1 className="ink-title mt-2 text-4xl leading-tight text-foreground sm:text-6xl">
          अंग्रेजी सारांश दीजिए, पूरी हिंदी मंगा कहानी लीजिए
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          कहानी पूरी तरह कैजुअल देवनागरी हिंदी में लिखी जाती है। कम से कम{" "}
          {WORDS_TARGET.toLocaleString("hi-IN")} शब्द, खुला अंत, और जब चाहें अगला पार्ट। कोई लॉगिन
          नहीं, कोई रोक नहीं।
        </p>

        <div className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor="summary">
              कहानी का अंग्रेजी सारांश
            </label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={10}
              placeholder="Write the full English summary of your manga story here..."
              className="border-2 border-foreground bg-background"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor="author">
                आपका नाम
              </label>
              <Input
                id="author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Anonymous"
                className="border-2 border-foreground bg-background"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={start}
                disabled={busy}
                size="lg"
                className="w-full border-2 border-foreground text-base font-bold"
              >
                {busy ? "शुरू हो रहा है" : "कहानी लिखना शुरू करें"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            t: "पूरी कैजुअल हिंदी",
            d: "रोज़ की बोलचाल वाले आसान शब्द। कोई अंक, चिन्ह या अंग्रेजी नहीं, इसलिए आवाज़ में सुनने पर एकदम सहज।",
          },
          {
            t: "लंबी और बंधी हुई",
            d: "हुक, ट्विस्ट, सस्पेंस, हँसी और इमोशन के साथ पचास हजार से ज्यादा शब्द, और अंत हमेशा खुला।",
          },
          {
            t: "खुली लाइब्रेरी",
            d: "हर कहानी सबके लिए खुली है। कोई भी पढ़ सकता है, डाउनलोड कर सकता है और अगला पार्ट लिखवा सकता है।",
          },
        ].map((c) => (
          <div key={c.t} className="panel rounded-md bg-card p-5">
            <h2 className="ink-title text-xl text-foreground">{c.t}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{c.d}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="secondary" className="border-2 border-foreground font-bold">
          <Link to="/library">लाइब्रेरी देखें</Link>
        </Button>
        <Button asChild variant="outline" className="border-2 border-foreground font-bold">
          <Link to="/api-docs">खुला एपीआई</Link>
        </Button>
      </div>
    </main>
  );
}
