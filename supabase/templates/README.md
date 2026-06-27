# Supabase auth email config (Option A: Resend SMTP + dashboard templates)

These templates are pasted into the Supabase dashboard — they are NOT applied
from the repo. Tracked here so they're versioned and copy-pasteable.

## 1. Custom SMTP — Authentication → SMTP Settings → enable
| Field | Value |
|-------|-------|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your **Resend API key** (the secret — lives only here, never in the app) |
| Sender email | an address on your **Resend-verified domain**, e.g. `noreply@lilithforge.com` |
| Sender name | `Inkubus` (or `Draft Demon`) |

The from-domain MUST be the domain you verified in Resend (SPF/DKIM/DMARC), or
mail lands in spam.

## 2. Email templates — Authentication → Email Templates
| Template | Subject | Body |
|----------|---------|------|
| Confirm signup | `Verify your Inkubus account` | paste `confirm-signup.html` |
| Reset password | `Reset your Inkubus password` | paste `reset-password.html` |

`{{ .ConfirmationURL }}` is substituted by Supabase with the real verify/recovery link.

## 3. URL configuration — Authentication → URL Configuration
- **Site URL:** your domain (the confirm link redirects here after verification).
- **Redirect URLs:** must include `draftdemon://auth-callback` (desktop OAuth + post-confirm return).

## 4. Verify
Sign up with a real address → confirmation email should hit the **inbox** (not
spam). In Gmail use "Show original" to confirm SPF / DKIM / DMARC all PASS.
Tracked in Jira: KAN-88.
