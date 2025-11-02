# Problem #4: Email Confirmation Conflicts with Magic Link

**Severity:** 🟠 MEDIUM
**Time to Debug:** ~30 minutes
**Time to Fix:** ~2 minutes
**Session:** 2 (2025-11-01)

---

## TL;DR

Enabling "Email Confirmation" in Supabase creates double-verification for Magic Link users. Magic Link itself is email confirmation - enabling both breaks the flow.

---

## Symptoms

**With Email Confirmation ON:**
1. User clicks Magic Link
2. Redirects to: `/auth/v1/verify?type=signup&token=...`
3. Message: "Email confirmed"
4. BUT user NOT logged in! ❌

**Expected:** User logged in after clicking Magic Link

---

## Root Cause

**Two-step verification conflict:**

```
Flow with Email Confirmation ON:
1. User enters email
2. Email sent: "Confirm your email" link
3. User clicks link → Email confirmed
4. User must login AGAIN with Magic Link
```

**Magic Link is ALREADY email confirmation!**
- Possession of email = verification
- No need for separate confirmation step

---

## Solution

**Supabase Dashboard → Authentication → Settings:**

1. Providers → Email → Edit
2. **Confirm email:** Toggle OFF
3. Save

**Result:** One-click Magic Link login

---

## Comparison

| Email Confirmation | Magic Link Behavior |
|-------------------|---------------------|
| ON | Click link → Confirm → Login again ❌ |
| OFF | Click link → Logged in ✅ |

---

## When to Enable Email Confirmation

**Enable when:**
- Using traditional password auth (not Magic Link)
- Need explicit "verify email" step
- Compliance requirements

**Disable when:**
- Using Magic Link only
- Using OAuth only (Google, Facebook)
- Want frictionless signup

---

## Testing

1. Disable Email Confirmation
2. Request Magic Link
3. Click link in email
4. Should be logged in immediately (no intermediate step)

---

## Related

- **Session:** [2025-11-01-session2.md](../sessions/2025-11-01-session2.md#0255---тестирование-edge-cases)
- **Supabase Docs:** [Email Auth](https://supabase.com/docs/guides/auth/auth-email)

---

**Lesson:** Magic Link = passwordless + email verification in one. Don't double-verify!
