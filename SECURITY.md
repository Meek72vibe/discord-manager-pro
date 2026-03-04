# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | ✅ Yes    |
| 1.x     | ❌ No     |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report security issues by emailing the maintainer directly (email in GitHub profile) or using GitHub's private vulnerability reporting feature.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and aim to release a fix within 7 days.

## Security Best Practices for Users

1. **Never share your `config.json`** — it contains your API keys and Discord token
2. **Add `config.json` and `warnings.json` to `.gitignore`** before pushing to GitHub
3. **Use the minimum required bot permissions** — don't give the bot Administrator
4. **Regularly rotate your Discord bot token** if you suspect compromise
5. **Review AI moderation suggestions** before executing moderation actions
6. **Keep dependencies updated** — run `npm audit` regularly

## What We Do

- All sensitive values are redacted from logs
- No data is transmitted to third parties except through your chosen AI provider using your own API key
- We follow responsible disclosure practices

## AI Advisory Notice

AI analysis tools (toxicity detection, moderation suggestions, raid detection, ban appeal drafting) are **advisory only**. They assist human moderators but should not be used as the sole basis for moderation actions such as bans, kicks, or timeouts.

Always apply human judgment before acting on AI suggestions.

## SAFE_MODE

By default, `SAFE_MODE=true` disables all destructive tools (ban, kick, delete channel, bulk delete, etc.). This prevents accidental data loss and limits the blast radius of any misconfiguration or prompt injection attack.

To enable destructive tools, explicitly set `SAFE_MODE=false` in your `.env` or `config.json`.
