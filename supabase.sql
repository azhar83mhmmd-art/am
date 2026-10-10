-- =====================================================================
-- AM Premify - Supabase (real-time aktivasi)
-- Jalankan seluruh isi file ini di: Supabase Dashboard > SQL Editor > Run
-- Aman dijalankan berulang kali.
-- =====================================================================

-- 1) Tabel aktivitas sukses (tanpa menyimpan email / data pribadi)
create table if not exists public.activations (
  id          bigint generated always as identity primary key,
  source      text        not null default 'panel',
  created_at  timestamptz not null default now()
);

create index if not exists activations_created_at_idx
  on public.activations (created_at desc);

-- 2) Keamanan (RLS): publik hanya boleh MEMBACA.
--    Insert hanya dari server (service_role key), tidak bisa dari browser.
alter table public.activations enable row level security;

drop policy if exists "activations_public_read" on public.activations;
create policy "activations_public_read"
  on public.activations
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.activations from anon, authenticated;

-- 3) Fungsi statistik: total, hari ini, dan 7 hari terakhir (zona waktu WIB)
create or replace function public.get_activation_stats()
returns json
language sql
stable
as $$
  select json_build_object(
    'total', (select count(*) from public.activations),
    'today', (
      select count(*) from public.activations
      where (created_at at time zone 'Asia/Jakarta')::date
          = (now() at time zone 'Asia/Jakarta')::date
    ),
    'daily', (
      select coalesce(json_agg(
               json_build_object('day', x.d, 'count', x.c) order by x.d
             ), '[]'::json)
      from (
        select g.d::date as d,
               (select count(*) from public.activations a
                 where (a.created_at at time zone 'Asia/Jakarta')::date = g.d::date) as c
        from generate_series(
               ((now() at time zone 'Asia/Jakarta')::date - 6)::timestamp,
               ((now() at time zone 'Asia/Jakarta')::date)::timestamp,
               interval '1 day'
             ) as g(d)
      ) x
    )
  );
$$;

grant execute on function public.get_activation_stats() to anon, authenticated;

-- 4) Aktifkan Realtime untuk tabel activations
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activations'
  ) then
    alter publication supabase_realtime add table public.activations;
  end if;
end $$;

-- (Opsional) tes manual: tambah 1 aktivitas lalu cek statistik
-- insert into public.activations (source) values ('tes');
-- select public.get_activation_stats();
