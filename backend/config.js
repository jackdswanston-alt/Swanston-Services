/* Swanston Services — backend configuration.

   Safe to commit. The publishable key is designed to sit in a public web page:
   it grants nothing on its own, because every row it can reach is decided by
   the row-level security policies in supabase/schema.sql.

   Never put the secret key (sb_secret_...) in this file. That one bypasses
   every rule. It belongs only in server-side environment variables. */
window.SWANSTON_CONFIG = {
  supabaseUrl:     "https://ratpmltykynkubvhazlf.supabase.co",
  supabaseAnonKey: "sb_publishable_87FdzmCQYYnYz0_G0XZTKg_yx0Aj4_n"
};
