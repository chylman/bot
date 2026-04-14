import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;

serve(async (req) => {
  const { message } = await req.json();
  if (!message?.text) return new Response("OK", { status: 200 });

  console.log(`Получено сообщение от ${message.from.first_name}: ${message.text}`);

  // 1. Создаём клиент Supabase
  const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 2. Сохраняем сообщение в БД
  const { error } = await supabase.from("messages").insert({
    telegram_chat_id: message.chat.id,
    username: message.from.first_name || "Unknown",
    text: message.text,
  });

  if (error) {
    console.error("Ошибка записи в БД:", error.message);
  } else {
    console.log("Сообщение сохранено в БД");
  }

  // 3. Проверяем, подключён ли менеджер к этому чату
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("manager_id")
    .eq("telegram_chat_id", message.chat.id)
    .maybeSingle();

  // Отправляем эхо только если менеджер НЕ подключён
  if (!session) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: `🤖 Вы написали: ${message.text}`,
      }),
    });
    console.log(`Эхо-ответ отправлен в чат ${message.chat.id}`);
  } else {
    console.log(`Менеджер подключён к чату ${message.chat.id} — эхо подавлено`);
  }

  return new Response("OK", { status: 200 });
});
