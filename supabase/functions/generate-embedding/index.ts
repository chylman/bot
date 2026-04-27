import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const { id } = await req.json();
  if (!id) return new Response("Missing id", { status: 400, headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch the KB entry
  const { data: entry, error: fetchError } = await supabase
    .from("knowledge_base")
    .select("id, question, answer")
    .eq("id", id)
    .single();

  if (fetchError || !entry) {
    console.error("Entry not found:", fetchError?.message);
    return new Response("Entry not found", { status: 404, headers: CORS });
  }

  // Generate embedding from question + answer combined for richer context
  const textToEmbed = `${entry.question}\n${entry.answer}`;

  try {
    const model = new Supabase.ai.Session("gte-large");
    const embedding = await model.run(textToEmbed, { mean_pool: true, normalize: true });

    const { error: updateError } = await supabase
      .from("knowledge_base")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to save embedding:", updateError.message);
      return new Response("Failed to save embedding", { status: 500, headers: CORS });
    }

    console.log(`Embedding generated for KB entry ${id}`);
    return new Response("OK", { status: 200, headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Embedding generation error:", msg);
    return new Response(`Embedding error: ${msg}`, { status: 500, headers: CORS });
  }
});
