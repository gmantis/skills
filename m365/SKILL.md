---
name: m365
description: "Microsoft 365 (Outlook + Teams): read unread emails, send email, list/read/post Teams chats and channels. Triggers on 'check my email', 'read emails', 'send email to...', 'post to teams', 'check teams', 'list chats', 'read <channel>', 'post to <channel/chat>'."
---

# Microsoft 365 via Power Automate

This skill wraps the user's Power Automate HTTP-triggered flows for Outlook and Teams.
All commands run through the unified CLI at `C:\Users\xxiang\m365\m365.py`.

**Why this exists**: Ab Initio's M365 tenant blocks admin consent for Microsoft Graph CLI,
so we built HTTP-triggered flows in Power Automate. Authentication uses Azure AD device
code flow via Azure CLI's public client ID (pre-approved in the tenant). Token is cached
at `~/.m365_token_cache.json` so the user rarely has to re-authenticate.

## Quick reference

| Intent | Command |
|--------|---------|
| Check unread emails | `python C:/Users/xxiang/m365/m365.py read-emails --count 10` |
| Send email | `python C:/Users/xxiang/m365/m365.py send-email --to EMAIL --subject S --body B` |
| List Teams chats | `python C:/Users/xxiang/m365/m365.py list-chats [--filter TEXT]` |
| Read a Teams chat | `python C:/Users/xxiang/m365/m365.py read-teams-chat --chat-id ID --count N` |
| Read a Teams channel | `python C:/Users/xxiang/m365/m365.py read-teams-channel --team-id T --channel-id C --count N` |
| Post to a Teams chat | `python C:/Users/xxiang/m365/m365.py post-teams-chat --chat-id ID --message M` |
| Post to a Teams channel | `python C:/Users/xxiang/m365/m365.py post-teams-channel --team-id T --channel-id C --message M [--subject S]` |

The Python CLI is cross-platform; just invoke it with `python <path>` from any cwd.

## Usage patterns

### Reading emails

User says: "check my email" / "any new emails?" / "read the last 5 unread"

```bash
python C:/Users/xxiang/m365/m365.py read-emails --count 10
```

Output format: `[N] YYYY-MM-DDTHH:MM | sender@email | subject preview`

Use `--json` for full structured response (subject, body, from, importance, etc.).

### Sending email

User says: "send email to alice about X" / "email bob: meet at 3pm"

Required:
- `--to EMAIL` (comma-separate for multiple)
- `--subject TEXT`
- `--body TEXT` (accepts HTML: `<p>`, `<b>`, `<a>`, etc.)

Optional:
- `--cc EMAIL`

Before sending: **confirm recipient, subject, and body with the user**. Email is a publish
action that's hard to unsend.

### Posting to Teams

User says: "post to #general that X" / "message the project channel"

Two kinds of destinations:
- **Channel**: part of a Team. Needs `team_id` + `channel_id`. Use `post-teams-channel`.
- **Chat**: 1:1 DM or group chat (not in a Team). Needs `chat_id`. Use `post-teams-chat`.

Finding IDs:
- For a channel: ask user for the channel link (right-click channel → "Get link to channel").
  Team ID = `groupId` query param; channel ID = URL-decoded segment before the name.
- For a chat: run `list-chats` (optionally with `--filter` to narrow). Copy the `id`.
- For "Just me" (self-notes chat): chat_id is the special value `48:notes`.

Before posting: **confirm the destination and message with the user**. Teams posts are
visible to others and cannot be quietly unsent.

Body accepts HTML for formatting.

### Reading Teams

User says: "what's in the AIDP channel?" / "read my chat with X"

- Channel messages: `read-teams-channel` — needs team_id + channel_id
- Chat messages: `read-teams-chat` — needs chat_id
- Discovering chats: `list-chats [--filter TEXT]` — searches topics

Output auto-strips HTML and shows sender + 200-char preview. Use `--json` for full data.

## Authentication

First run opens a device-code flow (terminal prints a URL + code; user signs in with
browser; approves). Subsequent runs use the cached token silently.

If you see `AADSTS` errors or token refresh failures: just re-run the command; MSAL will
re-prompt for device code auth.

## Flow URLs

Stored in `C:\Users\xxiang\m365\flows.json`:
- `read_emails` — unread inbox
- `send_email` — send new
- `list_chats` — all chats
- `read_teams_chat` — chat messages by chat_id
- `read_teams_channel` — channel messages by team_id + channel_id
- `post_teams_chat` — post to chat
- `post_teams_channel` — post to channel

If a flow stops working, the user can check it at `https://make.powerautomate.com` under
**My flows**. Naming convention: `Claude - <Action>`.

## Safety rules

- **Publish actions need confirmation.** Before `send-email`, `post-teams-channel`,
  `post-teams-chat`: show the user the destination + message and wait for explicit
  approval ("approve", "send it", "go ahead"). "Do X" is not a standing approval for
  future publishes.
- **Never include secrets in messages.** Never paste the flow URLs, access tokens, or
  the MSAL cache file contents into an email or Teams post.
- **PII awareness**: email body/recipients and Teams chat content may contain sensitive
  info. Don't log them to untrusted locations.
