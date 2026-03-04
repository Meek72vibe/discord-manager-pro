# Discord Bot Verification — Pre-Written Answers

Use these answers when Discord asks you to apply for privileged intents.
Apply when your bot reaches 75 servers — don't wait until 100.

---

## Application URL
https://discord.com/developers/applications → Your App → Bot → Privileged Gateway Intents

---

## SERVER MEMBERS INTENT

**Why does your bot need the Server Members Intent?**

> Discord Manager Pro needs the Server Members Intent to provide complete server management capabilities via the Model Context Protocol (MCP). Specifically, this intent is required to: (1) list server members with their roles and join dates for the list_members and get_member_info tools, (2) perform member moderation actions including kick, ban, and timeout while validating role hierarchy, (3) assign and remove roles from members, (4) detect unusual join patterns for raid protection, and (5) find inactive members for community health analysis. Without this intent, core member management features would be non-functional.

---

## MESSAGE CONTENT INTENT

**Why does your bot need the Message Content Intent?**

> Discord Manager Pro requires the Message Content Intent to power its AI-driven community analysis features. This includes: (1) summarizing channel activity to help server owners understand what topics their community discusses, (2) analyzing community sentiment to detect mood shifts and potential issues, (3) detecting toxic messages and rule violations to assist human moderators, (4) generating weekly community health reports, and (5) identifying crisis situations requiring moderator attention. Message content is processed in real-time through the server owner's own AI API key and is never stored or transmitted to our servers. The software is self-hosted, meaning message data never leaves the server owner's machine except to their chosen AI provider under their own API agreement.

---

## DATA USAGE

**How is data from these intents stored and used?**

> Discord Manager Pro is entirely self-hosted open-source software. No data is stored on our servers because we have no servers. All data processing occurs locally on the server owner's machine. Member data is fetched on-demand via the Discord API and held in memory only for the duration of the request. Message content used for AI analysis is sent directly from the user's machine to their chosen AI provider (Anthropic, Google, Groq, etc.) using their own API key, under their own API agreement. No message content, member data, or any other Discord data is collected, stored, or transmitted to the Discord Manager Pro project maintainers at any time.

---

## PRIVACY POLICY URL

https://meek72vibe.github.io/discord-manager-pro/privacy-policy

---

## TERMS OF SERVICE URL

https://meek72vibe.github.io/discord-manager-pro/terms

---

## BOT DESCRIPTION (for Discord listing)

> Discord Manager Pro is an AI-native Discord server management tool built for the Model Context Protocol (MCP). It allows server owners and community managers to manage their Discord server through natural language conversation with Claude AI. Features include channel management, member moderation, role administration, thread management, webhook control, scheduled events, community analytics, and AI-powered insights including activity summaries, sentiment analysis, toxicity detection, raid detection, and server health scoring. The bot is self-hosted open-source software — users run it on their own machines with their own API keys.

---

## Tips for Approval

1. Submit early — apply at 75 servers, not 100
2. Make sure your GitHub repo is public and has a clear README
3. Make sure privacy policy and ToS URLs are live (set up GitHub Pages first)
4. Be specific — vague answers get rejected
5. The answers above explain the WHY, not just the WHAT
