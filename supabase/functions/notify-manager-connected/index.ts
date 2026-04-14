import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: { telegram_chat_id?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { telegram_chat_id } = body;
  if (!telegram_chat_id) {
    return new Response(JSON.stringify({ error: "Missing telegram_chat_id" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Verify there really is an active manager session before notifying
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: session } = await supabaseAdmin
    .from("chat_sessions")
    .select("manager_id")
    .eq("telegram_chat_id", telegram_chat_id)
    .maybeSingle();

  if (!session) {
    return new Response(JSON.stringify({ error: "No active session for this chat" }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  // Send notification to the Telegram user
  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegram_chat_id,
      text: "👨‍💼 Менеджер подключился к чату. Теперь вы общаетесь с живым человеком.",
    }),
  });

  const tgData = await tgRes.json();
  console.log(`Notification sent to chat ${telegram_chat_id}:`, JSON.stringify(tgData));

  return new Response(JSON.stringify({ ok: tgData.ok }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
