import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api-docs")({
  head: () => ({
    meta: [
      { title: "खुला एपीआई | मंगा लाइब्रेरी एंडपॉइंट" },
      {
        name: "description",
        content:
          "पूरी हिंदी मंगा लाइब्रेरी का खुला एपीआई। बिना चाबी, बिना लॉगिन, किसी भी प्रोजेक्ट में कहानी और पार्ट पढ़िए।",
      },
      { property: "og:title", content: "खुला एपीआई | मंगा लाइब्रेरी एंडपॉइंट" },
      {
        property: "og:description",
        content: "लाइब्रेरी, कहानी और पार्ट के तीन खुले एंडपॉइंट, जेसन और टेक्स्ट दोनों में।",
      },
    ],
  }),
  component: ApiDocs,
});

const ENDPOINTS = [
  {
    path: "/api/public/library",
    what: "पूरी लाइब्रेरी, हर कहानी के साथ उसके सारे पार्ट और डाउनलोड लिंक।",
  },
  {
    path: "/api/public/story/:storyId",
    what: "एक कहानी की पूरी जानकारी और उसके पार्ट की सूची।",
  },
  {
    path: "/api/public/part/:partId?format=json",
    what: "एक पार्ट की पूरी कहानी जेसन में।",
  },
  {
    path: "/api/public/part/:partId?format=txt",
    what: "एक पार्ट की पूरी कहानी सादी टेक्स्ट फाइल में, सीधे डाउनलोड के लिए।",
  },
];

function ApiDocs() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="ink-title text-4xl text-foreground sm:text-5xl">खुला एपीआई</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        पूरी लाइब्रेरी सबके लिए खुली है। कोई चाबी नहीं, कोई लॉगिन नहीं। किसी भी दूसरे प्रोजेक्ट से
        सीधे ये एंडपॉइंट इस्तेमाल कीजिए। हर जवाब में क्रॉस ऑरिजिन खुला रखा गया है।
      </p>

      <div className="mt-8 space-y-4">
        {ENDPOINTS.map((e) => (
          <div key={e.path} className="panel rounded-md bg-card p-5">
            <code className="block break-all rounded-sm bg-secondary px-3 py-2 font-mono text-sm text-secondary-foreground">
              GET {e.path}
            </code>
            <p className="mt-3 text-sm text-muted-foreground">{e.what}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-6 rounded-md bg-card p-5">
        <h2 className="ink-title text-2xl text-foreground">उदाहरण</h2>
        <pre className="mt-3 overflow-x-auto rounded-sm bg-secondary p-4 font-mono text-xs text-secondary-foreground">
          {`const res = await fetch("https://your-site/api/public/library");
const { stories } = await res.json();

const part = stories[0].parts[0];
const text = await fetch("https://your-site" + part.text_url + "?format=txt").then(r => r.text());`}
        </pre>
      </div>
    </main>
  );
}
