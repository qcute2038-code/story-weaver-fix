CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'नई मंगा कहानी',
  summary text NOT NULL,
  author_name text NOT NULL DEFAULT 'Anonymous',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.story_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  part_number int NOT NULL,
  title text NOT NULL DEFAULT '',
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'planning',
  word_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, part_number)
);

CREATE TABLE public.story_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.story_parts(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  title text NOT NULL DEFAULT '',
  brief text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  word_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (part_id, chunk_index)
);

CREATE INDEX idx_parts_story ON public.story_parts(story_id);
CREATE INDEX idx_chunks_part ON public.story_chunks(part_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO anon, authenticated;
GRANT ALL ON public.stories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_parts TO anon, authenticated;
GRANT ALL ON public.story_parts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_chunks TO anon, authenticated;
GRANT ALL ON public.story_chunks TO service_role;

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read stories" ON public.stories FOR SELECT USING (true);
CREATE POLICY "public write stories" ON public.stories FOR INSERT WITH CHECK (true);
CREATE POLICY "public update stories" ON public.stories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete stories" ON public.stories FOR DELETE USING (true);

CREATE POLICY "public read parts" ON public.story_parts FOR SELECT USING (true);
CREATE POLICY "public write parts" ON public.story_parts FOR INSERT WITH CHECK (true);
CREATE POLICY "public update parts" ON public.story_parts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete parts" ON public.story_parts FOR DELETE USING (true);

CREATE POLICY "public read chunks" ON public.story_chunks FOR SELECT USING (true);
CREATE POLICY "public write chunks" ON public.story_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "public update chunks" ON public.story_chunks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete chunks" ON public.story_chunks FOR DELETE USING (true);