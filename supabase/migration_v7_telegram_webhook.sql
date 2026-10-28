-- ============================================================
-- PT GONDAM — migration_v7_telegram_webhook.sql
-- Alternatif Database Webhook lewat trigger SQL langsung (pakai
-- ekstensi pg_net), supaya tidak bergantung pada menu "Webhooks"
-- di dashboard yang kadang berpindah/berbeda di tiap versi.
--
-- Efeknya SAMA PERSIS dengan Database Webhook: setiap kali baris
-- `transactions` di-UPDATE dan `payment_status` baru saja berubah
-- jadi 'PROOF_SUBMITTED', trigger ini akan memanggil Edge Function
-- `telegram-notify` lewat HTTP.
--
-- Jalankan file ini di Supabase SQL Editor SETELAH:
--   1. migration_v6_banners.sql (dan migration lain sebelumnya)
--   2. Edge Function `telegram-notify` sudah di-deploy
--   3. Secrets TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID sudah di-set
-- ============================================================

-- 1. Aktifkan ekstensi pg_net (untuk panggil HTTP dari dalam Postgres)
create extension if not exists pg_net with schema extensions;

-- 2. Function trigger — memanggil Edge Function telegram-notify
--    lewat HTTP setiap kali payment_status baru berubah jadi
--    PROOF_SUBMITTED. URL & anon key di bawah sudah otomatis
--    disesuaikan dengan project PT GONDAM ini.
create or replace function public.notify_telegram_proof_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'PROOF_SUBMITTED'
     and (old.payment_status is distinct from 'PROOF_SUBMITTED') then

    perform net.http_post(
      url := 'https://rjorraiiexiirhdjiniv.supabase.co/functions/v1/telegram-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_Zcw9UyOheH9YT-FAmSuSwg_CvmcTLPA'
      ),
      body := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'transactions',
        'record', to_jsonb(new),
        'old_record', to_jsonb(old)
      )
    );
  end if;
  return new;
end;
$$;

-- 3. Pasang trigger di tabel transactions
drop trigger if exists trg_notify_telegram_proof_submitted on transactions;
create trigger trg_notify_telegram_proof_submitted
  after update on transactions
  for each row execute function public.notify_telegram_proof_submitted();
