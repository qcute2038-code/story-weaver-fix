import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PARALLEL_WRITERS } from "./story-rules";
import { finishPart, planPart, writeStoryChunk } from "./stories.functions";

export type WriterState = {
  running: boolean;
  phase: string;
  done: number;
  total: number;
  words: number;
  skipped: number;
  error: string | null;
};


export function useStoryWriter(partId: string | null, onUpdate: () => void) {
  const [state, setState] = useState<WriterState>({
    running: false,
    phase: "रुका हुआ",
    done: 0,
    total: 0,
    words: 0,
    skipped: 0,
    error: null,
  });
  const stopRef = useRef(false);
  const busyRef = useRef(false);

  const stop = useCallback(() => {
    stopRef.current = true;
    setState((s) => ({ ...s, running: false, phase: "रोका गया" }));
  }, []);

  const run = useCallback(async () => {
    if (!partId || busyRef.current) return;
    busyRef.current = true;
    stopRef.current = false;
    setState((s) => ({ ...s, running: true, error: null, phase: "शुरू हो रहा है" }));

    // No progress guard: if a whole round finishes without a single new
    // finished chapter, the loop is stuck and must not spin forever.
    let lastFinished = -1;
    let idleRounds = 0;

    try {
      for (let guard = 0; guard < 400; guard++) {
        if (stopRef.current) break;

        const { data: part } = await supabase
          .from("story_parts")
          .select("id, status")
          .eq("id", partId)
          .single();
        if (!part) throw new Error("पार्ट नहीं मिला");

        if (part.status === "complete") {
          setState((s) => ({ ...s, running: false, phase: "पूरा हो गया" }));
          break;
        }

        if (part.status === "planning") {
          setState((s) => ({ ...s, phase: "सारांश पढ़कर प्लान बनाया जा रहा है" }));
          await planPart({ data: { partId } });
          onUpdate();
          continue;
        }

        const { data: chunks } = await supabase
          .from("story_chunks")
          .select("id, status, word_count")
          .eq("part_id", partId)
          .order("chunk_index");
        const list = chunks ?? [];
        // Only chapters still marked pending need work. A chapter parked as
        // skipped has used up its tries and must never be picked up again.
        const pending = list.filter((c) => c.status === "pending");
        const skipped = list.filter((c) => c.status === "skipped").length;
        const finished = list.length - pending.length;
        const words = list.reduce((sum, c) => sum + c.word_count, 0);
        setState((s) => ({
          ...s,
          total: list.length,
          done: finished,
          words,
          skipped,
          phase:
            pending.length === 0
              ? "जाँच हो रही है"
              : `अध्याय लिखे जा रहे हैं (${finished} में से ${list.length})` +
                (skipped > 0 ? ` - ${skipped} अध्याय छोड़े गए` : ""),
        }));

        if (pending.length === 0) {
          const result = await finishPart({ data: { partId } });
          onUpdate();
          if (result.status === "complete") {
            setState((s) => ({
              ...s,
              running: false,
              words: result.wordCount,
              phase:
                skipped > 0 ? `पूरा हो गया - ${skipped} अध्याय छोड़े गए` : "पूरा हो गया",
            }));
            break;
          }
          continue;
        }

        if (finished > lastFinished) {
          lastFinished = finished;
          idleRounds = 0;
        } else if (++idleRounds >= 3) {
          throw new Error(
            `कहानी आगे नहीं बढ़ पा रही है, ${pending.length} अध्याय अटके हुए हैं। दोबारा कोशिश करें।`,
          );
        }

        // Twelve chapters at a time, spread across all four keys.
        const batch = pending.slice(0, PARALLEL_WRITERS);
        await Promise.all(
          batch.map((c, i) =>
            writeStoryChunk({ data: { chunkId: c.id, keyIndex: i % PARALLEL_WRITERS } }).catch(
              (err: unknown) => {
                console.error("chunk failed", err);
              },
            ),
          ),
        );
        onUpdate();
      }
    } catch (err) {

      setState((s) => ({
        ...s,
        running: false,
        error: err instanceof Error ? err.message : String(err),
        phase: "गड़बड़ हुई",
      }));
    } finally {
      busyRef.current = false;
    }
  }, [partId, onUpdate]);

  useEffect(() => {
    return () => {
      stopRef.current = true;
    };
  }, []);

  return { state, run, stop };
}
