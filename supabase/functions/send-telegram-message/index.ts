import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Extract user ID from the JWT that the Supabase platform already verified. */
function getUserIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  // The Supabase platform already verified the JWT signature before running this code.
  // We just decode the payload to get the user ID — no extra API call needed.
  const userId = getUserIdFromJwt(authHeader);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Could not read user from token" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { telegram_chat_id?: number; text?: string; message_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { telegram_chat_id, text, message_id } = body;
  if (!telegram_chat_id || !text) {
    return new Response(JSON.stringify({ error: "Missing telegram_chat_id or text" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Verify the requesting user holds the active session for this chat
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("chat_sessions")
    .select("manager_id")
    .eq("telegram_chat_id", telegram_chat_id)
    .maybeSingle();

  console.log("session lookup:", JSON.stringify({ session, sessionError, userId, telegram_chat_id }));

  if (!session || session.manager_id !== userId) {
    return new Response(
      JSON.stringify({ error: "You are not the active manager for this chat" }),
      { status: 403, headers: corsHeaders }
    );
  }

  // Send message via Telegram Bot API
  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegram_chat_id, text }),
  });

  const tgData = await tgRes.json();
  console.log(`Telegram API response for chat ${telegram_chat_id}:`, JSON.stringify(tgData));

  // Update message delivery status
  if (message_id) {
    if (tgData.ok) {
      await supabaseAdmin
        .from("messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", message_id);
    } else {
      await supabaseAdmin
        .from("messages")
        .update({
          status: "error",
          error_message: tgData.description ?? "Telegram API error",
        })
        .eq("id", message_id);
    }
  }

  return new Response(JSON.stringify({ ok: tgData.ok }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
