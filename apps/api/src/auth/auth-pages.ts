import { escapeHtml } from './mail.service.js';

/** Small self-contained HTML pages for the email links (no deep linking needed in the app). */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Music Room</title>
<style>
body{margin:0;background:#0E0E12;color:#F2F1F7;font-family:Roboto,system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:400px;width:100%;margin:16px;background:#18181F;border-radius:12px;padding:24px;box-sizing:border-box}
h1{font-size:22px;font-weight:500;margin:0 0 12px}p{color:#A09FB0;line-height:1.5}
label{display:block;margin:16px 0 4px;color:#A09FB0;font-size:14px}
input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #2A2A34;background:#0E0E12;color:#F2F1F7;font-size:16px}
button{margin-top:24px;width:100%;height:48px;border:0;border-radius:9999px;background:#8B5CF6;color:#fff;font-size:15px;font-weight:500}
.error{color:#EF4444}
</style></head><body><main>${body}</main></body></html>`;
}

export const AuthPages = {
  verified: () =>
    page(
      'Email confirmed',
      '<h1>Email confirmed</h1><p>You can return to the app and tap “I’ve verified”.</p>',
    ),
  verifyInvalid: () =>
    page(
      'Link expired',
      '<h1>This link has expired or was already used</h1><p>Open the app and tap “Resend” on the “Check your email” screen to get a new one.</p>',
    ),
  // No form action: the browser posts back to the page's own URL, which carries ?token= (and any path prefix).
  resetForm: (error?: string) =>
    page(
      'Set a new password',
      `<h1>Set a new password</h1>${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<form method="post">
<label for="password">New password (at least 8 characters)</label>
<input id="password" name="password" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
<label for="confirm">Repeat it</label>
<input id="confirm" name="confirm" type="password" minlength="8" maxlength="128" required autocomplete="new-password">
<button type="submit">Save password</button></form>`,
    ),
  resetDone: () =>
    page(
      'Password changed',
      '<h1>Password changed</h1><p>You can return to the app and log in with your new password.</p>',
    ),
  resetInvalid: () =>
    page(
      'Link expired',
      '<h1>This link has expired or was already used</h1><p>Request a new one from “Forgot password?” in the app.</p>',
    ),
};
