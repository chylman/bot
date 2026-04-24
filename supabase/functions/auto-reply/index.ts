import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN    = Deno.env.get("BOT_TOKEN")!;
const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY")!;

serve(async (req) => {
  const { chatId, userText } = await req.json();
  if (!chatId || !userText) return new Response("Bad request", { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── 0. Загружаем настройки из БД ────────────────────────────────────────
  const { data: cfg, error: cfgErr } = await supabase
    .from("bot_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (cfgErr || !cfg) {
    console.error("Failed to load bot_settings:", cfgErr?.message);
    return new Response("Config error", { status: 500 });
  }

  const {
    model,
    system_prompt,
    max_tokens,
    temperature,
    daily_limit,
    history_count,
    kb_top_k,
    similarity_thr,
    fallback_msg,
  } = cfg;

  // ── 1. Проверяем дневной лимит ───────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const { data: usage } = await supabase
    .from("ai_usage")
    .select("calls")
    .eq("date", today)
    .maybeSingle();

  if (usage && usage.calls >= daily_limit) {
    console.log(`Daily limit reached (${usage.calls}/${daily_limit}), sending fallback`);
    await sendTelegram(chatId, fallback_msg);
    return new Response("OK", { status: 200 });
  }

  // ── 2. Векторный поиск по базе знаний ───────────────────────────────────
  let kbContext = "";
  if (kb_top_k > 0) {
    try {
      const embModel = new Supabase.ai.Session("gte-small");
      const queryEmbedding = await embModel.run(userText, { mean_pool: true, normalize: true });

      const { data: kbRows } = await supabase.rpc("match_knowledge_base", {
        query_embedding: queryEmbedding,
        match_threshold: similarity_thr,
        match_count: kb_top_k,
      });

      if (kbRows && kbRows.length > 0) {
        const entries = kbRows.map((r: any) => `В: ${r.question}\nО: ${r.answer}`).join("\n\n");
        kbContext = `\n\nБаза знаний (используй эти ответы если они релевантны):\n${entries}`;
        console.log(`KB: found ${kbRows.length} relevant entries`);
      } else {
        console.log("KB: no relevant entries found");
      }
    } catch (err) {
      console.error("KB search error:", err);
    }
  }

  // ── 3. Загружаем историю чата ────────────────────────────────────────────
  const { data: historyRows } = await supabase
    .from("messages")
    .select("text, sender")
    .eq("telegram_chat_id", chatId)
    .in("sender", ["user", "manager", "bot"])
    .order("created_at", { ascending: false })
    .limit(history_count + 1);

  const history = (historyRows ?? [])
    .reverse()
    .slice(0, -1)
    .map((m: any) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text ?? "",
    }));

  // ── 4. Запрос в DeepSeek ─────────────────────────────────────────────────
  let aiAnswer: string | null = null;
  let tokensUsed = 0;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system_prompt + kbContext },
          ...history,
          { role: "user", content: userText },
        ],
        max_tokens,
        temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`DeepSeek error ${response.status}:`, err);
      await sendTelegram(chatId, fallback_msg);
      return new Response("OK", { status: 200 });
    }

    const data = await response.json();
    aiAnswer   = data.choices?.[0]?.message?.content ?? null;
    tokensUsed = data.usage?.total_tokens ?? 0;
  } catch (err) {
    console.error("DeepSeek fetch error:", err);
    await sendTelegram(chatId, fallback_msg);
    return new Response("OK", { status: 200 });
  }

  if (!aiAnswer) {
    await sendTelegram(chatId, fallback_msg);
    return new Response("OK", { status: 200 });
  }

  // ── 5. Сохраняем ответ бота в БД ────────────────────────────────────────
  await supabase.from("messages").insert({
    telegram_chat_id: chatId,
    text: aiAnswer,
    sender: "bot",
  });

  // ── 6. Отправляем пользователю ───────────────────────────────────────────
  await sendTelegram(chatId, aiAnswer);
  console.log(`Auto-reply sent to chat ${chatId}, model: ${model}, tokens: ${tokensUsed}`);

  // ── 7. Обновляем дневной счётчик ─────────────────────────────────────────
  await supabase.rpc("increment_ai_usage", {
    p_date: today,
    p_tokens: tokensUsed,
  });

  return new Response("OK", { status: 200 });
});

async function sendTelegram(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
