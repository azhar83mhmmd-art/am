/* ============================================================
   PT GONDAM — supabase-client.js
   Konfigurasi terpusat Supabase client (browser).
   JANGAN PERNAH memasukkan SUPABASE_SERVICE_ROLE_KEY di sini.
   ============================================================ */

const SUPABASE_URL = 'https://lbokehbiexotaphwlzlg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zhV9R5jbdWuiR9p8up10xg_LVeUb8az';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
