## Security policy

### Reporting a vulnerability
- Do not open public GitHub issues for security reports.
- Contact the maintainers privately with a clear description and a minimal reproduction.

### Secret handling
- Never commit `.env*` files containing real secrets.
- If a secret is exposed (GitHub, logs, chat, screenshots), rotate it immediately:
  - Supabase: rotate service role key / JWT keys if applicable, and review RLS policies
  - Database: rotate DB password
  - Stripe: rotate secret key and webhook signing secret

