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

  const { data: cfg, error: cfgErr } = await supabase
    .from("bot_settings")
    .select("greeting_phrase")
    .eq("id", 1)
    .single();

  if (cfgErr || !cfg?.greeting_phrase) {
    return new Response("Failed to load greeting_phrase", { status: 500, headers: CORS });
  }

  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: cfg.greeting_phrase }),
  });

  if (!embRes.ok) {
    const err = await embRes.text();
    return new Response(`OpenAI error: ${err}`, { status: 500, headers: CORS });
  }

  const embData = await embRes.json();
  const embedding: number[] = embData.data[0].embedding;

  const { error: updateErr } = await supabase
    .from("bot_settings")
    .update({ greeting_embedding: JSON.stringify(embedding) })
    .eq("id", 1);

  if (updateErr) {
    return new Response(`Failed to save embedding: ${updateErr.message}`, { status: 500, headers: CORS });
  }

  console.log("Greeting embedding generated successfully");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
