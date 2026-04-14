# C4 Architecture Diagrams — Telegram Bot Admin Panel

## Level 1: System Context

```mermaid
C4Context
  title System Context — Telegram Bot + Admin Panel

  Person(admin, "Admin", "Manages conversations via the admin panel")
  Person(tgUser, "Telegram User", "Sends messages in Telegram")

  System_Boundary(sys, "Telegram Bot System") {
    System(adminPanel, "Admin Panel", "Next.js 16 web app for reading user messages and sending replies")
    System(supabase, "Supabase Backend", "PostgreSQL database, Auth, Realtime, and Edge Functions")
  }

  System_Ext(telegram, "Telegram", "Messaging platform & Bot API")

  Rel(tgUser, telegram, "Sends message")
  Rel(telegram, supabase, "Delivers webhook (POST)", "HTTPS")
  Rel(supabase, telegram, "Sends reply via Bot API", "HTTPS")
  Rel(admin, adminPanel, "Views chats, sends replies", "Browser")
  Rel(adminPanel, supabase, "Reads messages, writes outbox, auth", "HTTPS / WSS")
```

---

## Level 2: Container

```mermaid
C4Container
  title Container Diagram — Telegram Bot System

  Person(admin, "Admin", "Manages conversations")
  Person(tgUser, "Telegram User", "Sends Telegram messages")
  System_Ext(telegram, "Telegram", "Bot API + messaging platform")

  System_Boundary(sys, "Telegram Bot System") {

    Container(adminApp, "Admin Panel", "Next.js 16 / React 19 / TypeScript", "Server-rendered + client-hydrated SPA. Lists chats, shows message threads, allows admin replies")

    Container_Boundary(sb, "Supabase") {
      Container(webhookFn, "telegram-webhook", "Deno Edge Function", "Receives Telegram webhook POSTs, stores incoming messages, echoes reply via Bot API")
      ContainerDb(db, "PostgreSQL 17", "Supabase Managed DB", "Stores messages and bot_outbox tables with RLS policies")
      Container(auth, "Supabase Auth (GoTrue)", "Auth Service", "Manages admin accounts, PKCE sessions, JWT tokens, password reset")
      Container(realtime, "Supabase Realtime", "WebSocket Service", "Broadcasts INSERT events on messages and bot_outbox to subscribed clients")
      Container(postgrest, "PostgREST", "Auto REST API", "Exposes messages and bot_outbox tables as REST endpoints, enforces RLS")
    }
  }

  Rel(tgUser, telegram, "Sends message")
  Rel(telegram, webhookFn, "POST /telegram-webhook", "HTTPS")
  Rel(webhookFn, db, "INSERT into messages", "SQL")
  Rel(webhookFn, telegram, "POST /sendMessage (echo)", "HTTPS / Bot API")

  Rel(admin, adminApp, "Uses browser", "HTTPS")
  Rel(adminApp, auth, "signIn / signOut / resetPassword", "HTTPS")
  Rel(adminApp, postgrest, "GET messages, GET/POST bot_outbox", "HTTPS + JWT")
  Rel(adminApp, realtime, "Subscribe to INSERT events", "WSS")

  Rel(db, realtime, "Triggers change events", "Internal")
  Rel(postgrest, db, "Queries & mutations", "SQL")
```

---

## Level 3: Component — Admin Panel

```mermaid
C4Component
  title Component Diagram — Admin Panel (Next.js)

  Person(admin, "Admin")
  System_Ext(supabase, "Supabase", "Auth / PostgREST / Realtime")

  Container_Boundary(adminApp, "Admin Panel — Next.js 16") {

    Component(mainPage, "MainPage", "React Server Component\napp/page.tsx", "Auth-guards the root route. Fetches all unique telegram_chat_id from messages. Renders chat sidebar and selected chat.")

    Component(chatPage, "ChatPage", "React Server Component\napp/chat/[chatId]/page.tsx", "Auth-guards the chat route. Passes chatId to Chat component.")

    Component(chat, "Chat", "React Client Component\napp/chat/[chatId]/Chat.tsx", "Loads messages + bot_outbox in parallel. Subscribes to realtime INSERTs on both tables. Merges and sorts messages. Renders chat thread. Submits admin replies to bot_outbox.")

    Component(loginPage, "LoginPage", "Next.js page\napp/login/page.tsx", "Public route rendering the LoginForm.")

    Component(loginForm, "LoginForm", "React Client Component\napp/login/LoginForm.tsx", "Collects email + password. Calls signIn server action. Shows errors.")

    Component(authActions, "Auth Server Actions", "Next.js Server Actions\napp/actions/auth.ts", "signIn() — calls supabase.auth.signInWithPassword\nsignOut() — calls supabase.auth.signOut\nsendReset() — calls supabase.auth.resetPasswordForEmail")

    Component(forgotPassword, "ForgotPasswordPage", "React Client Component\napp/forgot-password/send-form.tsx", "Calls supabase.auth.resetPasswordForEmail(). Sends magic link to admin email.")

    Component(authCallback, "AuthCallbackPage", "React Client Component\napp/auth/callback/page.tsx", "Exchanges PKCE code for session. Handles hash-based tokens. Renders password-reset form. Calls supabase.auth.updateUser({ password }).")

    Component(browserClient, "SupabaseBrowserClient", "TypeScript module\nlib/supabase.ts", "createBrowserClient with PKCE flow. Used by all client components for REST, Realtime, and Auth.")

    Component(serverClient, "SupabaseServerClient", "TypeScript module\nlib/supabaseServer.ts", "createServerClient with cookie read/write for SSR. Used by server components and server actions.")
  }

  Rel(admin, loginForm, "Enters credentials")
  Rel(loginForm, authActions, "Calls signIn()", "Server Action")
  Rel(authActions, serverClient, "Uses for auth")

  Rel(admin, forgotPassword, "Requests reset")
  Rel(forgotPassword, browserClient, "resetPasswordForEmail()")

  Rel(authCallback, browserClient, "exchangeCodeForSession()\nupdateUser()")

  Rel(mainPage, serverClient, "Checks session\nFetches chat list from messages")
  Rel(chatPage, serverClient, "Checks session")

  Rel(chat, browserClient, "GET messages\nGET bot_outbox\nPOST bot_outbox\nREALTIME subscribe")

  Rel(browserClient, supabase, "HTTPS + WSS")
  Rel(serverClient, supabase, "HTTPS")
```

---

## Level 3: Component — Supabase Backend

```mermaid
C4Component
  title Component Diagram — Supabase Backend

  System_Ext(telegram, "Telegram Bot API")
  System_Ext(adminPanel, "Admin Panel")

  Container_Boundary(sb, "Supabase") {

    Component(webhookFn, "telegram-webhook Edge Function", "Deno / TypeScript\nsupabase/functions/telegram-webhook/index.ts", "Entry point for all Telegram webhook events. Validates payload. Stores user messages. Sends echo via Bot API.")

    Component(messagesTable, "messages table", "PostgreSQL Table", "Stores all incoming Telegram messages.\nColumns: id, telegram_chat_id, username, text, created_at\nRLS: SELECT open to all authenticated users")

    Component(botOutboxTable, "bot_outbox table", "PostgreSQL Table", "Outbound message queue.\nColumns: id, telegram_chat_id, text, admin_uid, status, created_at, sent_at, error_message\nStatus: pending → sent | error")

    Component(rlsPolicies, "Row Level Security Policies", "PostgreSQL RLS", "messages: SELECT for authenticated\nbot_outbox SELECT: authenticated\nbot_outbox INSERT: authenticated\nbot_outbox UPDATE: service_role only")

    Component(goTrue, "Auth Service (GoTrue)", "Supabase Auth", "Issues JWT access tokens (1h expiry). Handles PKCE flows, refresh tokens, password reset emails.")

    Component(realtimeService, "Realtime Service", "Supabase Realtime / WebSocket", "Listens to WAL on messages and bot_outbox tables. Broadcasts INSERT events to subscribed admin clients over WSS.")

    Component(postGREST, "PostgREST API", "Auto REST Layer", "Translates HTTP requests to SQL. Enforces RLS using JWT claims. Serves GET/POST for messages and bot_outbox.")
  }

  Rel(telegram, webhookFn, "POST webhook payload", "HTTPS")
  Rel(webhookFn, messagesTable, "INSERT message", "SQL via service_role")
  Rel(webhookFn, telegram, "POST /sendMessage (echo)", "HTTPS")

  Rel(adminPanel, goTrue, "signIn / signOut / resetPassword", "HTTPS")
  Rel(adminPanel, postGREST, "GET messages\nGET bot_outbox\nPOST bot_outbox", "HTTPS + Bearer JWT")
  Rel(adminPanel, realtimeService, "Subscribe to INSERT events", "WSS + JWT")

  Rel(postGREST, messagesTable, "SELECT / INSERT", "SQL")
  Rel(postGREST, botOutboxTable, "SELECT / INSERT / UPDATE", "SQL")
  Rel(postGREST, rlsPolicies, "Enforces per request")

  Rel(realtimeService, messagesTable, "Watches WAL stream")
  Rel(realtimeService, botOutboxTable, "Watches WAL stream")
```
