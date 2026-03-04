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
The key service files are all in `src/core/`. Tools are registered in `src/index.ts`.

## Adding a New Tool

1. Add the function to the appropriate `src/core/*.ts` service file
2. Add the tool schema to the `TOOLS` array in `src/index.ts`
3. Add the case to `runTool()` switch in `src/index.ts`
4. If the tool is destructive (deletes data), add to `DESTRUCTIVE_TOOLS` in `src/core/constants.ts`
5. Write a test in `tests/`
6. Update the tool table in `README.md`

## Running Tests

```bash
npm test              # Run all test suites
npm run test:watch    # Watch mode (requires Vitest)
npm run test:cover    # Coverage report
```

Tests are in `tests/`. New tests should use Vitest and mock Discord.js via `tests/mocks/discord.ts`.

## Code Style

- TypeScript strict mode — zero `any` in new code
- All AI tool responses must use typed interfaces from `src/types/ai-responses.ts`
- All limits via `LIMITS` from `src/core/constants.ts` — no magic numbers
- All user content sanitized with `sanitizeForPrompt()` before AI injection
- Never return webhook URLs in responses (security)
- All new service functions must follow the `ToolResult<T>` pattern

## License

By contributing, you agree your contributions will be licensed under MIT.
