import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

serve(async (req) => {
  const { message } = await req.json();
  if (!message?.text) return new Response("OK", { status: 200 });

  const chatId: number = message.chat.id;
  const firstName: string = message.from?.first_name || "Unknown";

  console.log(`Получено сообщение от ${firstName}: ${message.text}`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1. Проверяем, новый ли это пользователь (до upsert)
  const { data: existingClient } = await supabase
    .from("clients")
    .select("telegram_chat_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  const isNewUser = !existingClient;

  // 2. Upsert клиента — FK на messages требует наличия строки в clients
  await supabase.from("clients").upsert(
    {
      telegram_chat_id: chatId,
      username: firstName,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "telegram_chat_id" }
  );

  // 3. Сохраняем сообщение в БД
  const { error } = await supabase.from("messages").insert({
    telegram_chat_id: chatId,
    username: firstName,
    text: message.text,
    sender: "user",
  });

  if (error) {
    console.error("Ошибка записи в БД:", error.message);
  } else {
    console.log("Сообщение сохранено в БД");
  }

  // 4. Проверяем, подключён ли менеджер к этому чату
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("manager_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (session) {
    console.log(`Менеджер подключён к чату ${chatId} — автоответ подавлен`);
    return new Response("OK", { status: 200 });
  }

  // 5. Приветствие для новых пользователей (отправляем до auto-reply)
  if (isNewUser) {
    await sendTelegramMessage(
      chatId,
      `Привет, ${firstName}! 👋\n\nДобро пожаловать! Задайте ваш вопрос, и я постараюсь помочь.`
    );
    console.log(`Приветственное сообщение отправлено в чат ${chatId}`);
  }

  // 6. Запускаем auto-reply асинхронно (не ждём — Telegram не должен ждать)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  fetch(`${supabaseUrl}/functions/v1/auto-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ chatId, userText: message.text }),
  }).catch((err) => console.error("auto-reply invoke error:", err));

  return new Response("OK", { status: 200 });
});
