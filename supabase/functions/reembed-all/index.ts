import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1. Fetch all KB entries
  const { data: entries, error: fetchError } = await supabase
    .from("knowledge_base")
    .select("id, question, answer");

  if (fetchError || !entries) {
    console.error("Failed to fetch entries:", fetchError?.message);
    return new Response(`Failed to fetch entries: ${fetchError?.message}`, { status: 500, headers: CORS });
  }

  if (entries.length === 0) {
    return new Response(JSON.stringify({ ok: 0 }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // 2. Build input texts and call OpenAI batch embeddings
  const texts = entries.map((e: any) => `${e.question}\n${e.answer}`);

  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  });

  if (!embRes.ok) {
    const err = await embRes.text();
    console.error("OpenAI error:", err);
    return new Response(`OpenAI error: ${err}`, { status: 500, headers: CORS });
  }

  const embData = await embRes.json();
  const embeddings: number[][] = embData.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((d: any) => d.embedding);

  // 3. Update all entries in parallel
  const updates = entries.map((entry: any, i: number) =>
    supabase
      .from("knowledge_base")
      .update({ embedding: JSON.stringify(embeddings[i]) })
      .eq("id", entry.id)
  );

  const results = await Promise.all(updates);
  const failed = results.filter(r => r.error).length;

  console.log(`reembed-all: ${entries.length - failed} updated, ${failed} failed`);

  return new Response(
    JSON.stringify({ ok: entries.length - failed, fail: failed }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
});
