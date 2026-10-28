-- ============================================================
-- PT GONDAM — migration_v6_banners.sql
-- Fitur: Poster/Banner carousel otomatis di homepage (di atas
-- "Jelajahi Kategori"), dikelola penuh dari admin panel.
--
-- - Admin bisa upload banyak poster (tidak dibatasi 3), urutkan,
--   aktif/nonaktifkan, dan hapus.
-- - Publik hanya boleh MEMBACA banner yang is_active = true.
-- - Gambar disimpan di bucket account-images (sudah ada),
--   folder baru: account-images/banners/...
--
-- Jalankan file ini di Supabase SQL Editor SETELAH migration
-- sebelumnya (schema.sql, migration_pure_supabase.sql, dst).
-- ============================================================

-- ── TABEL banners ────────────────────────────────────────────
create table if not exists banners (
  id uuid primary key default uuid_generate_v4(),
  image_url text not null,
  title text,
  link_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_banners_active_order
  on banners (is_active, sort_order);

-- trigger updated_at (pakai fungsi yang sudah ada di project ini)
drop trigger if exists trg_banners_updated_at on banners;
create trigger trg_banners_updated_at
  before update on banners
  for each row execute function set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
alter table banners enable row level security;

drop policy if exists "Publik baca banner aktif" on banners;
drop policy if exists "Admin kelola banner" on banners;

-- Publik (anon) hanya boleh melihat banner yang aktif
create policy "Publik baca banner aktif" on banners
  for select using (is_active = true);

-- Admin login boleh insert/update/delete/select semua banner
create policy "Admin kelola banner" on banners
  for all using (public.is_admin()) with check (public.is_admin());

-- ── STORAGE: folder banners/ di bucket account-images ───────
-- Bucket account-images sudah ada (public, dipakai untuk foto akun).
-- Di sini kita tambahkan policy insert/update/delete KHUSUS admin
-- untuk folder banners/. Baca tetap memakai policy publik yang
-- sudah ada ("Publik baca account-images").
drop policy if exists "Admin upload banner" on storage.objects;
drop policy if exists "Admin update banner" on storage.objects;
drop policy if exists "Admin hapus banner" on storage.objects;

create policy "Admin upload banner" on storage.objects
  for insert with check (
    bucket_id = 'account-images'
    and (storage.foldername(name))[1] = 'banners'
    and public.is_admin()
  );

create policy "Admin update banner" on storage.objects
  for update using (
    bucket_id = 'account-images'
    and (storage.foldername(name))[1] = 'banners'
    and public.is_admin()
  ) with check (
    bucket_id = 'account-images'
    and (storage.foldername(name))[1] = 'banners'
    and public.is_admin()
  );

create policy "Admin hapus banner" on storage.objects
  for delete using (
    bucket_id = 'account-images'
    and (storage.foldername(name))[1] = 'banners'
    and public.is_admin()
  );
