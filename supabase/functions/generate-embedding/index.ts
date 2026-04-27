import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const { id } = await req.json();
  if (!id) return new Response("Missing id", { status: 400, headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: entry, error: fetchError } = await supabase
    .from("knowledge_base")
    .select("id, question, answer")
    .eq("id", id)
    .single();

  if (fetchError || !entry) {
    console.error("Entry not found:", fetchError?.message);
    return new Response("Entry not found", { status: 404, headers: CORS });
  }

  try {
    const textToEmbed = `${entry.question}\n${entry.answer}`;
    const embedding = await getEmbedding(textToEmbed);

    const { error: updateError } = await supabase
      .from("knowledge_base")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to save embedding:", updateError.message);
      return new Response(`Failed to save embedding: ${updateError.message}`, { status: 500, headers: CORS });
    }

    console.log(`Embedding generated for KB entry ${id}`);
    return new Response("OK", { status: 200, headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Embedding generation error:", msg);
    return new Response(`Embedding error: ${msg}`, { status: 500, headers: CORS });
  }
});
