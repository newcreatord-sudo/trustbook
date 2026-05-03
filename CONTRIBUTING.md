## Contributing

### Local setup
```bash
npm install
cp .env.example .env.local
npm run dev
```

### Quality gate
```bash
npm run verify:local:strict
```

### Conventions
- Keep secrets out of Git history (`.env*`, tokens, keys).
- Prefer existing utilities and patterns already used in the codebase.
- Run the strict gate before opening a pull request.

