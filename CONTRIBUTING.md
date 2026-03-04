# Contributing to Discord Manager Pro

Thank you for your interest in contributing! 🎉

## How to Contribute

### Reporting Bugs
Open an issue with:
- What happened
- What you expected
- Steps to reproduce
- Node.js version + OS

### Suggesting Features
Open an issue with the `enhancement` label and describe your idea.

### Pull Requests
1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Make your changes following the rules in [CLAUDE.md](CLAUDE.md)
4. Run tests: `npm test`
5. Run build: `npm run build` — must pass with zero TypeScript errors
6. Push and open a PR

## Development Setup

```bash
git clone https://github.com/meek72vibe/discord-manager-pro
cd discord-manager-pro
npm install
cp .env.example .env
# Fill in .env values (DISCORD_TOKEN and GUILD_ID minimum)
npm run build
npm run dashboard   # Opens setup UI in browser
```

## Project Structure

Read [CLAUDE.md](CLAUDE.md) for the full architecture guide before writing any code.
The key service files are all in `src/tools/`. Tools are registered dynamically via `src/core/toolRegistry.ts`.

## Adding a New Tool

1. Find the appropriate category folder under `src/tools/` (e.g., `structure`, `moderation`).
2. Add your tool definition object to the exported array in `index.ts`.
3. Set `destructive: true` if the tool modifies the server permanently.
4. Set required Discord.js `PermissionFlagsBits` in the `requiredPermissions` array.
5. The Zod pipeline will automatically hook it up for the LLM!
6. Update the tool table in `README.md`

## Running Tests

```bash
node full-discord-test.mjs  # Run total test diagnostic
npm test                    # Run all unit test suites
```

Tests for the v5 layer can be run locally.

## Code Style

- TypeScript strict mode — zero `any` in new code
- All tools must use Zod schemas in `schema` property
- All limits via `LIMITS` from `src/config/limits.ts` — no magic numbers
- All user content sanitized with `sanitizeUserContent()` before AI injection
- Never return webhook URLs in responses (security)
- All new service functions must be registered in the Zod tool registry

## License

By contributing, you agree your contributions will be licensed under MIT.
