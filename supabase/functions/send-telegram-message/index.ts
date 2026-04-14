import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;

serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Require a valid user JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const jwt = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { telegram_chat_id?: number; text?: string; outbox_id?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { telegram_chat_id, text, outbox_id } = body;
  if (!telegram_chat_id || !text) {
    return new Response(JSON.stringify({ error: "Missing telegram_chat_id or text" }), { status: 400 });
  }

  // Verify the requesting user is the active manager for this chat
  const { data: session } = await supabaseAdmin
    .from("chat_sessions")
    .select("manager_id")
    .eq("telegram_chat_id", telegram_chat_id)
    .maybeSingle();

  if (!session || session.manager_id !== user.id) {
    return new Response(
      JSON.stringify({ error: "You are not the active manager for this chat" }),
      { status: 403 }
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

  // Update bot_outbox status so the admin panel reflects delivery
  if (outbox_id) {
    if (tgData.ok) {
      await supabaseAdmin
        .from("bot_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", outbox_id);
    } else {
      await supabaseAdmin
        .from("bot_outbox")
        .update({
          status: "error",
          error_message: tgData.description ?? "Telegram API error",
        })
        .eq("id", outbox_id);
    }
  }

  return new Response(JSON.stringify({ ok: tgData.ok }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
