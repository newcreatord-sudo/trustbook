-- Ripristina il flusso standard Supabase Auth: invio email di conferma alla registrazione.
-- La migrazione 0045_auto_confirm_users.sql impostava email_confirmed_at in BEFORE INSERT su auth.users,
-- impedendo il comportamento "confirm email" lato GoTrue e quindi le notifiche di verifica.

DROP TRIGGER IF EXISTS on_auth_user_created_auto_confirm ON auth.users;

DROP FUNCTION IF EXISTS public.auto_confirm_user();
