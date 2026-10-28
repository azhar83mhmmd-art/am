-- ============================================================
-- PT GONDAM — Migrasi V8: Pembelian MANUAL via WhatsApp
-- Jalankan di Supabase → SQL Editor SETELAH migration_v7 (atau v6).
-- Aman dijalankan ulang (idempotent).
--
-- Alur:
--   1. Pembeli klik "Beli Sekarang" → isi nama + WhatsApp.
--   2. RPC create_whatsapp_order mengunci akun (RESERVED) dan membuat
--      nomor pesanan GDM-YYYYMMDD-XXXXXX. Akun tidak bisa dibeli orang
--      lain selama masa tahan (default 120 menit).
--   3. Browser membuka WhatsApp admin (082357961890) dengan pesan siap
--      pakai berisi data akun + nomor pesanan.
--   4. Admin membalas, menyepakati pembayaran lewat WhatsApp, lalu di
--      dashboard menekan "Approve" (→ akun SOLD) atau "Tolak/Batalkan"
--      (→ akun AVAILABLE lagi). Tidak ada pembayaran otomatis.
-- ============================================================

-- 1. Kolom tambahan di transactions -------------------------------------
alter table transactions add column if not exists buyer_name text;
alter table transactions add column if not exists note text;
alter table transactions alter column buyer_name drop not null;

-- 2. Nomor pesanan berprefix GDM- ---------------------------------------
create or replace function public.generate_invoice_id() returns text language plpgsql as $$
declare c text; begin
  loop
    c := 'GDM-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text||clock_timestamp()::text),1,6));
    exit when not exists (select 1 from transactions where invoice_id = c);
  end loop;
  return c;
end $$;

-- 3. Masa tahan akun: 120 menit (hanya jika masih nilai bawaan 30) ------
update site_settings set payment_expiration_minutes = 120
 where id = 1 and payment_expiration_minutes = 30;

-- 4. RPC buat pesanan WhatsApp -------------------------------------------
drop function if exists public.create_whatsapp_order(uuid, text, text, text);
create or replace function public.create_whatsapp_order(
  p_account_id uuid, p_buyer_name text, p_buyer_whatsapp text, p_buyer_note text
) returns table (invoice_id text, transaction_id uuid, expires_at timestamptz,
  account_name text, account_code text, platform text, category_name text, price numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_acc accounts%rowtype; v_cat text; v_min int; v_inv text; v_exp timestamptz;
  v_id uuid; v_price numeric; v_digits text; v_active int;
begin
  if p_buyer_name is null or char_length(btrim(p_buyer_name)) < 2 then raise exception 'NAMA_WAJIB_DIISI'; end if;
  v_digits := regexp_replace(coalesce(p_buyer_whatsapp,''), '\D', '', 'g');
  if char_length(v_digits) < 8 or char_length(v_digits) > 15 then raise exception 'WHATSAPP_TIDAK_VALID'; end if;

  perform public.expire_stale_transactions();

  -- Batasi penimbunan: satu nomor WhatsApp maksimal 3 pesanan aktif.
  select count(*) into v_active from transactions t
   where regexp_replace(coalesce(t.buyer_whatsapp,''), '\D', '', 'g') = v_digits
     and t.payment_status = 'PENDING_PAYMENT'
     and (t.expires_at is null or t.expires_at > now());
  if v_active >= 3 then raise exception 'TERLALU_BANYAK_PESANAN'; end if;

  select * into v_acc from accounts where id = p_account_id for update;
  if not found then raise exception 'AKUN_TIDAK_DITEMUKAN'; end if;
  if v_acc.status <> 'AVAILABLE' then raise exception 'AKUN_TIDAK_TERSEDIA'; end if;

  v_price := public.effective_price(v_acc);          -- harga final (termasuk diskon) dihitung di server
  select name into v_cat from categories where id = v_acc.category_id;
  select coalesce(payment_expiration_minutes, 120) into v_min from site_settings where id = 1;
  v_inv := public.generate_invoice_id();
  v_exp := now() + (coalesce(v_min, 120) || ' minutes')::interval;

  update accounts set status = 'RESERVED' where id = p_account_id;
  begin
    insert into transactions (account_id, buyer_name, buyer_whatsapp, note, price,
      payment_method, payment_status, transaction_status, invoice_id, expires_at)
    values (p_account_id, btrim(p_buyer_name), btrim(p_buyer_whatsapp),
      nullif(btrim(coalesce(p_buyer_note,'')), ''), v_price,
      'MANUAL_WHATSAPP', 'PENDING_PAYMENT', 'PENDING', v_inv, v_exp)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'AKUN_TIDAK_TERSEDIA';
  end;

  return query select v_inv, v_id, v_exp, v_acc.name, v_acc.account_code, v_acc.platform, v_cat, v_price;
end $$;
grant execute on function public.create_whatsapp_order(uuid, text, text, text) to anon, authenticated;

-- 5. Status pesanan (dibaca halaman payment.html lewat nomor pesanan) ----
drop function if exists public.get_transaction_by_invoice(text);
create or replace function public.get_transaction_by_invoice(p_invoice_id text)
returns table (invoice_id text, payment_status text, transaction_status text, price numeric,
  buyer_name text, buyer_email text, buyer_whatsapp text, buyer_instagram text, payment_proof_path text,
  rejection_reason text, expires_at timestamptz, created_at timestamptz,
  payment_submitted_at timestamptz, verified_at timestamptz, completed_at timestamptz,
  account_id uuid, account_name text, account_code text, platform text, category_name text,
  payment_method text)
language sql security definer set search_path = public stable as $$
  select t.invoice_id, t.payment_status, t.transaction_status, t.price, t.buyer_name, t.buyer_email,
    t.buyer_whatsapp, t.buyer_instagram, t.payment_proof_path, t.rejection_reason, t.expires_at,
    t.created_at, t.payment_submitted_at, t.verified_at, t.completed_at,
    a.id, a.name, a.account_code, a.platform, c.name, t.payment_method
  from transactions t
  left join accounts a on a.id = t.account_id
  left join categories c on c.id = a.category_id
  where t.invoice_id = p_invoice_id limit 1;
$$;
grant execute on function public.get_transaction_by_invoice(text) to anon, authenticated;

-- 6. Pembeli boleh membatalkan pesanannya sendiri (selama belum dibayar) --
drop function if exists public.cancel_order_by_invoice(text);
create or replace function public.cancel_order_by_invoice(p_invoice_id text)
returns table (invoice_id text, payment_status text)
language plpgsql security definer set search_path = public as $$
declare v_tx transactions%rowtype;
begin
  select * into v_tx from transactions where transactions.invoice_id = p_invoice_id for update;
  if not found then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.payment_status <> 'PENDING_PAYMENT' then raise exception 'PESANAN_TIDAK_BISA_DIBATALKAN'; end if;
  update transactions set payment_status = 'EXPIRED', transaction_status = 'CANCELLED',
         rejection_reason = 'Dibatalkan oleh pembeli'
   where transactions.id = v_tx.id;
  update accounts set status = 'AVAILABLE' where id = v_tx.account_id and status = 'RESERVED';
  return query select v_tx.invoice_id, 'EXPIRED'::text;
end $$;
grant execute on function public.cancel_order_by_invoice(text) to anon, authenticated;

-- 7. Identitas situs: PT GONDAM + nomor admin ---------------------------
update site_settings set
  site_name      = 'PT GONDAM',
  merchant_name  = 'PT GONDAM',
  admin_whatsapp = '6282357961890',
  footer_text    = null,
  logo_url       = null,
  -- kosongkan template lama supaya template bawaan PT GONDAM (js/wa-templates.js) dipakai
  wa_template_buy = null,
  wa_template_offer = null,
  wa_template_sell = null,
  payment_whatsapp_template = null
where id = 1;
