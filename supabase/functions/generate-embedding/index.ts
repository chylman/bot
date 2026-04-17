import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { id } = await req.json();
  if (!id) return new Response("Missing id", { status: 400 });

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
    return new Response("Entry not found", { status: 404 });
  }

  // Generate embedding from question + answer combined for richer context
  const textToEmbed = `${entry.question}\n${entry.answer}`;

  try {
    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(textToEmbed, { mean_pool: true, normalize: true });

    const { error: updateError } = await supabase
      .from("knowledge_base")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to save embedding:", updateError.message);
      return new Response("Failed to save embedding", { status: 500 });
    }

    console.log(`Embedding generated for KB entry ${id}`);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Embedding generation error:", err);
    return new Response("Embedding error", { status: 500 });
  }
});
