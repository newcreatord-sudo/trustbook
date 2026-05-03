# TrustBook

TrustBook is a premium SaaS platform designed to eliminate no-shows for service businesses (salons, consultants, restaurants, etc.) through an intelligent "Trust Score" and dynamic deposit system.

## Features

- **Smart Booking System:** Real-time availability, duration matching, and conflict prevention.
- **Anti No-Show Engine:** Clients have a Trust Score (0-100). Low-score clients are automatically required to pay a deposit or require manual approval.
- **Stripe Payments Integration:** Native support for deposits, automated refunds for in-time cancellations, and forfeits for no-shows.
- **Business Dashboard:** Full control over schedule, services, staff, rules, and actionable alerts.
- **Customer Dashboard:** Tracking of bookings, reliability score, and history.
- **Real-Time Notifications:** In-app chat, status updates, and booking notifications.

## Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite
- **Backend:** Express, Supabase (PostgreSQL, Auth, RLS, Edge Functions/RPCs), Node.js
- **Payments:** Stripe Checkout & Webhooks
- **Maps:** Google Maps Platform

## Setup & Installation

### Prerequisites
- Node.js >= 18
- A Stripe Account

### Local Development

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd trustbook
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Copy `.env.example` to `.env.local` and fill in your keys:
   ```bash
   cp .env.example .env.local
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   *This will run both the Vite frontend and the Express API server concurrently.*

## Testing & Hardening

TrustBook is thoroughly tested. Run the test suite:
```bash
npm run test
```

For strict CI checks (Typecheck, Lint, Tests, Build):
```bash
npm run verify:local:strict
```

## Deployment

### Vercel (recommended)
- Import the GitHub repository into Vercel.
- Configure Environment Variables in Vercel (never commit `.env.*` files).
- Use the built-in deploy preflight scripts before deploying:
  ```bash
  npm run deploy:preflight:staging
  npm run deploy:preflight:production
  ```

### DB TLS (production-grade)
If your Postgres provider requires a custom CA chain, set:
- `DB_SSL_REJECT_UNAUTHORIZED=1`
- `DB_SSL_CA_PEM` (recommended on Vercel) or `DB_SSL_CA_FILE` (local file path)

## Security Notes
- All database access is protected by Supabase **Row Level Security (RLS)**.
- Sensitive API routes (Stripe Checkout, Webhooks) require proper authentication or signature verification.
- Passwords and Sessions are handled securely by Supabase Auth.
