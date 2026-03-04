# Changelog

## [2.0.0] - 2026-03-04 🚀 MAJOR RELEASE

### Added — 88 Total Tools

**Channel Management (9 new)**
- create_channel, delete_channel, edit_channel, create_category
- clone_channel, set_channel_topic, set_slowmode
- lock_channel, unlock_channel, set_channel_permissions

**Role Management (5 new)**
- create_role, delete_role, edit_role
- set_role_permissions, reorder_roles

**Advanced Moderation (10 new)**
- bulk_delete_messages, search_messages
- warn_member, get_warn_history, clear_warnings
- unban_member, list_bans
- add_reaction, remove_all_reactions, move_member

**Thread Management (7 new)**
- create_thread, list_threads, archive_thread
- unarchive_thread, lock_thread, add_member_to_thread, delete_thread

**Webhook Management (5 new)**
- create_webhook, list_webhooks, delete_webhook
- send_webhook_message, edit_webhook

**Event Management (5 new)**
- create_event, list_events, delete_event
- edit_event, get_event_attendees

**Analytics & Insights (7 new)**
- get_member_growth, find_inactive_members, find_top_members
- get_invite_stats, list_invites, create_invite, delete_invite

**Security & Safety (5 new)**
- list_recent_joins (with raid risk detection)
- check_new_accounts, list_bots
- disable_invites (emergency anti-raid), export_audit_log

**Emojis & Stickers (4 new)**
- list_emojis, delete_emoji, list_stickers, delete_sticker

**AI Intelligence Tools (12 new)**
- build_server_template, generate_server_rules, suggest_channels
- write_announcement, find_mod_candidates, weekly_digest
- server_health_score, detect_raid, onboard_member
- crisis_summary, draft_ban_appeal_response, suggest_rules_update

**Legal & Compliance**
- Privacy Policy (docs/privacy-policy.html)
- Terms of Service (docs/terms.html)
- Security Policy (SECURITY.md)
- Discord Verification pre-written answers

**Infrastructure**
- Local warning store (warnings.json) — zero external DB
- Multi-LLM support: Claude, Groq, Gemini, OpenRouter, Mistral, Ollama
- Browser setup dashboard (npm run dashboard)
- CLAUDE.md for AI-assisted development

## [1.0.0] - 2026-03-03

### Added
- 18 core MCP tools
- Discriminated union ToolResult<T>
- Permission pre-checks and role hierarchy guards
- Partial structure resolution
- Centralized AI prompts
- Test suite (3 suites, 37 tests)
