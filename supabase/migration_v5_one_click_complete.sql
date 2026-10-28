-- ============================================================
-- PT GONDAM — Migrasi V5: Verifikasi Pembayaran = Selesai
-- Sekaligus (satu klik admin, langsung tampil ke user)
-- ============================================================

drop function if exists public.approve_and_complete_transaction(uuid);
create or replace function public.approve_and_complete_transaction(p_transaction_id uuid)
returns table (invoice_id text, payment_status text, transaction_status text)
language plpgsql security definer set search_path = public as $$
declare v_tx transactions%rowtype;
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED'; end if;

  select * into v_tx from transactions where transactions.id = p_transaction_id for update;
  if not found then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.payment_status = 'PAID' and v_tx.transaction_status = 'COMPLETED' then
    return query select v_tx.invoice_id, v_tx.payment_status, v_tx.transaction_status;
    return;
  end if;

  update transactions
    set payment_status = 'PAID',
        transaction_status = 'COMPLETED',
        completed_at = now()
    where transactions.id = v_tx.id;

  return query select v_tx.invoice_id, 'PAID'::text, 'COMPLETED'::text;
end $$;
grant execute on function public.approve_and_complete_transaction(uuid) to authenticated;
