-- =====================================================================
-- AM Premify - Supabase (real-time aktivasi)
-- Jalankan seluruh isi file ini di: Supabase Dashboard > SQL Editor > Run
-- Aman dijalankan berulang kali.
-- =====================================================================

-- 1) Tabel aktivitas sukses
create table if not exists public.activations (
  id          bigint generated always as identity primary key,
  source      text        not null default 'panel',
  created_at  timestamptz not null default now()
);

-- Kolom email (tambahan): data lama TIDAK dihapus/diubah, baris lama berisi email kosong (null)
alter table public.activations add column if not exists email text;

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

-- =====================================================================
-- v4.2 - RATING, ULASAN & BUKTI SUKSES (real-time)
-- Aman dijalankan berulang kali.
--
-- WAJIB (sekali saja, di dashboard, bukan lewat SQL):
--   Authentication > Sign In / Providers > aktifkan "Allow anonymous sign-ins"
--   Dipakai agar tiap browser punya identitas sendiri, sehingga hanya
--   pemilik yang bisa menghapus ulasannya. Pengguna tidak perlu login.
-- =====================================================================

-- 6) Tabel ulasan (satu perangkat = satu ulasan)
create table if not exists public.reviews (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid(),
  name        text        not null check (char_length(btrim(name)) between 2 and 20),
  rating      smallint    not null check (rating between 1 and 5),
  comment     text                 check (comment is null or char_length(comment) <= 400),
  proof_path  text                 check (
                proof_path is null
                or (proof_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
                    and split_part(proof_path, '/', 1) = user_id::text)
              ),
  hidden      boolean     not null default false,   -- set true lewat SQL Editor untuk menyembunyikan ulasan/bukti tak pantas
  created_at  timestamptz not null default now()
);

create unique index if not exists reviews_one_per_user on public.reviews (user_id);
create index if not exists reviews_created_at_idx on public.reviews (created_at desc);
create index if not exists reviews_proof_idx on public.reviews (created_at desc) where proof_path is not null;

-- 7) Keamanan (RLS)
--    Baca: semua orang. Tulis/hapus: hanya pemilik (auth.uid()).
--    Pengguna hanya boleh mengubah kolom "name" (supaya nama ikut berubah jika diganti).
alter table public.reviews enable row level security;

drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews
  for select to anon, authenticated using (not hidden);

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert to authenticated with check (user_id = auth.uid() and hidden = false);

drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (name, rating, comment, proof_path) on public.reviews to authenticated;
grant update (name) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;

-- 8) Statistik rating asli (rata-rata, jumlah, sebaran bintang, jumlah bukti)
create or replace function public.get_rating_stats()
returns json
language sql
stable
as $$
  select json_build_object(
    'count',  count(*),
    'avg',    coalesce(round(avg(rating)::numeric, 3), 0),
    'proofs', count(*) filter (where proof_path is not null),
    's1',     count(*) filter (where rating = 1),
    's2',     count(*) filter (where rating = 2),
    's3',     count(*) filter (where rating = 3),
    's4',     count(*) filter (where rating = 4),
    's5',     count(*) filter (where rating = 5)
  )
  from public.reviews
  where not hidden;
$$;

grant execute on function public.get_rating_stats() to anon, authenticated;

-- 9) Realtime untuk tabel reviews
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reviews'
  ) then
    alter publication supabase_realtime add table public.reviews;
  end if;
end $$;

-- 10) Storage: bucket publik "proofs" untuk bukti akun (maks 2 MB, hanya gambar)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Siapa pun boleh melihat; hanya pemilik yang boleh mengunggah/menghapus di folder miliknya (folder = user id)
drop policy if exists "proofs_public_read" on storage.objects;
create policy "proofs_public_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'proofs');

drop policy if exists "proofs_insert_own" on storage.objects;
create policy "proofs_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "proofs_delete_own" on storage.objects;
create policy "proofs_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

-- (Opsional) sembunyikan ulasan/bukti yang tidak pantas:
-- update public.reviews set hidden = true where id = 'ISI-ID-ULASAN';
-- select public.get_rating_stats();

-- =====================================================================
-- v4.3 - NAMA DI AKTIVASI, CHAT USER <-> ADMIN, MENU ADMIN, BLOKIR PERANGKAT
-- Aman dijalankan berulang kali. Semua tabel baru PRIVAT: hanya server
-- (service_role key) yang bisa membaca/menulis, browser tidak bisa.
-- =====================================================================

-- 11) Nama pengguna ikut tercatat di aktivasi sukses (tampil di feed publik)
alter table public.activations add column if not exists name text;

-- 12) Perangkat (identitas = ID acak bertanda tangan dari server, bukan nama)
create table if not exists public.am_devices (
  id             text primary key check (id ~ '^[0-9a-f]{32}$'),
  name           text,
  names          text[]      not null default '{}',   -- riwayat nama yang pernah dipakai perangkat ini
  fp             text,                                 -- sidik jari perangkat (hash)
  hw             text,                                 -- sidik jari perangkat keras (hash)
  hwip           text,                                 -- hash(sidik jari + jaringan)
  ip             text,
  ua             text,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  blocked        boolean     not null default false,   -- true = fitur premium dinonaktifkan
  blocked_at     timestamptz,
  blocked_reason text,
  blocked_via    text,                                 -- admin | fp | jaringan | ip
  block_group    uuid,
  allow          boolean     not null default false    -- true = dikecualikan dari pencocokan otomatis
);
create index if not exists am_devices_last_seen_idx on public.am_devices (last_seen desc);
create index if not exists am_devices_fp_idx on public.am_devices (fp);
create index if not exists am_devices_hwip_idx on public.am_devices (hwip);
create index if not exists am_devices_group_idx on public.am_devices (block_group);

-- 13) Daftar sinyal perangkat yang diblokir (d = ID perangkat, f = sidik jari, h = sidik jari + jaringan, i = IP)
create table if not exists public.am_blocks (
  kind       text        not null check (kind in ('d', 'f', 'h', 'i')),
  value      text        not null,
  group_id   uuid        not null,
  device_id  text        references public.am_devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kind, value, group_id)
);

-- 14) Pemilik aktivasi (siapa yang melakukan aktivasi). Dipisah dari tabel publik "activations".
create table if not exists public.am_act_owner (
  activation_id bigint      primary key references public.activations(id) on delete cascade,
  device_id     text        not null references public.am_devices(id) on delete cascade,
  ip            text,
  created_at    timestamptz not null default now()
);
create index if not exists am_act_owner_dev_idx on public.am_act_owner (device_id, activation_id desc);

-- 15) Chat
create table if not exists public.am_chat (
  id         bigint generated always as identity primary key,
  device_id  text        not null references public.am_devices(id) on delete cascade,
  sender     text        not null check (sender in ('user', 'admin')),
  body       text        not null check (char_length(body) between 1 and 600),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists am_chat_dev_idx on public.am_chat (device_id, id);
create index if not exists am_chat_unread_idx on public.am_chat (sender, read_at) where read_at is null;

-- 16) Keamanan: RLS aktif tanpa policy + cabut semua hak anon/authenticated
alter table public.am_devices   enable row level security;
alter table public.am_blocks    enable row level security;
alter table public.am_act_owner enable row level security;
alter table public.am_chat      enable row level security;
revoke all on public.am_devices, public.am_blocks, public.am_act_owner, public.am_chat from anon, authenticated;

-- 17) Fungsi untuk menu admin (hanya service_role yang boleh menjalankan)
create or replace function public.am_activations_admin(lim int default 40, before_id bigint default null)
returns table(
  id bigint, created_at timestamptz, email text, name text,
  device_id text, ip text, device_name text, names text[], blocked boolean,
  device_acts bigint, unread bigint
)
language sql stable security definer set search_path = public as $$
  select a.id, a.created_at, a.email, a.name,
         o.device_id, o.ip, d.name, d.names, coalesce(d.blocked, false),
         (select count(*) from am_act_owner x where x.device_id = o.device_id),
         (select count(*) from am_chat c where c.device_id = o.device_id and c.sender = 'user' and c.read_at is null)
  from activations a
  left join am_act_owner o on o.activation_id = a.id
  left join am_devices d on d.id = o.device_id
  where before_id is null or a.id < before_id
  order by a.id desc
  limit least(greatest(lim, 1), 100);
$$;

create or replace function public.am_chat_threads(lim int default 60)
returns table(
  device_id text, name text, blocked boolean,
  last_body text, last_sender text, last_at timestamptz, unread bigint
)
language sql stable security definer set search_path = public as $$
  select d.id, d.name, d.blocked, l.body, l.sender, l.created_at,
         (select count(*) from am_chat c where c.device_id = d.id and c.sender = 'user' and c.read_at is null)
  from (select distinct on (device_id) device_id, body, sender, created_at
        from am_chat order by device_id, id desc) l
  join am_devices d on d.id = l.device_id
  order by l.created_at desc
  limit least(greatest(lim, 1), 200);
$$;

create or replace function public.am_devices_overview(q text default null, lim int default 80)
returns table(
  id text, name text, names text[], ip text, ua text,
  first_seen timestamptz, last_seen timestamptz,
  blocked boolean, blocked_reason text, blocked_via text, allow boolean,
  acts bigint, unread bigint
)
language sql stable security definer set search_path = public as $$
  select d.id, d.name, d.names, d.ip, d.ua, d.first_seen, d.last_seen,
         d.blocked, d.blocked_reason, d.blocked_via, d.allow,
         (select count(*) from am_act_owner o where o.device_id = d.id),
         (select count(*) from am_chat c where c.device_id = d.id and c.sender = 'user' and c.read_at is null)
  from am_devices d
  where coalesce(q, '') = ''
     or d.name ilike '%' || q || '%'
     or d.ip ilike '%' || q || '%'
     or exists (select 1 from unnest(d.names) n where n ilike '%' || q || '%')
  order by d.last_seen desc
  limit least(greatest(lim, 1), 300);
$$;

revoke all on function public.am_activations_admin(int, bigint) from public, anon, authenticated;
revoke all on function public.am_chat_threads(int) from public, anon, authenticated;
revoke all on function public.am_devices_overview(text, int) from public, anon, authenticated;
grant execute on function public.am_activations_admin(int, bigint) to service_role;
grant execute on function public.am_chat_threads(int) to service_role;
grant execute on function public.am_devices_overview(text, int) to service_role;
