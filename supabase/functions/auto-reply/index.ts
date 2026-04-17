import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN      = Deno.env.get("BOT_TOKEN")!;
const DEEPSEEK_KEY   = Deno.env.get("DEEPSEEK_API_KEY")!;
const DAILY_LIMIT    = 200; // max DeepSeek calls per day
const MAX_TOKENS     = 300; // max tokens in DeepSeek response
const HISTORY_COUNT  = 10;  // how many past messages to include
const KB_TOP_K       = 3;   // how many KB entries to inject
const SIMILARITY_THR = 0.5; // minimum cosine similarity to use a KB entry

const FALLBACK_MSG =
  "Извините, в данный момент автоответ недоступен. Наш менеджер скоро свяжется с вами.";

const SYSTEM_PROMPT = `Ты — дружелюбный помощник службы поддержки приложения для создания тренировок.
Приложение специализируется на футбольных тренировках для детей и взрослых, а также на общефизической подготовке.
Отвечай коротко, по делу, на русском языке.
Если вопрос выходит за рамки приложения или ты не знаешь ответа — скажи:
"Этот вопрос лучше уточнить у нашего менеджера, он скоро подключится к чату."
Не придумывай функции или возможности, которых нет в базе знаний.`;

serve(async (req) => {
  const { chatId, userText } = await req.json();
  if (!chatId || !userText) return new Response("Bad request", { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── 1. Проверяем дневной лимит ───────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: usage } = await supabase
    .from("ai_usage")
    .select("calls")
    .eq("date", today)
    .maybeSingle();

  if (usage && usage.calls >= DAILY_LIMIT) {
    console.log(`Daily limit reached (${usage.calls}/${DAILY_LIMIT}), sending fallback`);
    await sendTelegram(chatId, FALLBACK_MSG);
    return new Response("OK", { status: 200 });
  }

  // ── 2. Векторный поиск по базе знаний ───────────────────────────────────
  let kbContext = "";
  try {
    // Генерируем эмбеддинг запроса через Supabase AI (gte-small, 384d, бесплатно)
    const model = new Supabase.ai.Session("gte-small");
    const queryEmbedding = await model.run(userText, { mean_pool: true, normalize: true });

    const { data: kbRows } = await supabase.rpc("match_knowledge_base", {
      query_embedding: queryEmbedding,
      match_threshold: SIMILARITY_THR,
      match_count: KB_TOP_K,
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
    // Продолжаем без KB — DeepSeek ответит из общего контекста
  }

  // ── 3. Загружаем историю чата ────────────────────────────────────────────
  const { data: historyRows } = await supabase
    .from("messages")
    .select("text, sender")
    .eq("telegram_chat_id", chatId)
    .in("sender", ["user", "manager", "bot"])
    .order("created_at", { ascending: false })
    .limit(HISTORY_COUNT + 1); // +1 чтобы исключить текущее сообщение

  // Переводим в формат OpenAI/DeepSeek (от старых к новым, без последнего — это текущий запрос)
  const history = (historyRows ?? [])
    .reverse()
    .slice(0, -1) // убираем последнее (текущее) сообщение
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
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + kbContext },
          ...history,
          { role: "user", content: userText },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.5,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`DeepSeek error ${response.status}:`, err);
      await sendTelegram(chatId, FALLBACK_MSG);
      return new Response("OK", { status: 200 });
    }

    const data = await response.json();
    aiAnswer  = data.choices?.[0]?.message?.content ?? null;
    tokensUsed = data.usage?.total_tokens ?? 0;
  } catch (err) {
    console.error("DeepSeek fetch error:", err);
    await sendTelegram(chatId, FALLBACK_MSG);
    return new Response("OK", { status: 200 });
  }

  if (!aiAnswer) {
    await sendTelegram(chatId, FALLBACK_MSG);
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
  console.log(`Auto-reply sent to chat ${chatId}, tokens: ${tokensUsed}`);

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
