const SUPABASE_URL = 'YOUR_API_URL';
const SUPABASE_KEY = 'YOUR_PUBLISHABLE_KEY';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);