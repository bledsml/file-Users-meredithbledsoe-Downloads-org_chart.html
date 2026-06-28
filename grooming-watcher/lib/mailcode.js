'use strict';

const { ImapFlow } = require('imapflow');

/**
 * Read the most recent Pet Wants / Franpos login authorization code from Gmail.
 * Uses IMAP with the same Gmail App Password used for SMTP (it grants mail read
 * access). Polls because the code email arrives a few seconds after login.
 *
 * @param {{user:string, pass:string, sinceMs:number, timeoutMs?:number, pollMs?:number}} opts
 * @returns {Promise<string|null>} the numeric code, or null if not found in time
 */
async function fetchAuthCode({ user, pass, sinceMs, timeoutMs = 120000, pollMs = 5000 }) {
  if (!user || !pass) return null;

  // IMAP `since` is day-granular; back off a bit to be safe.
  const since = new Date((sinceMs || Date.now()) - 10 * 60 * 1000);
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search({ since, from: 'franpos.com' }, { uid: true });
        const recent = (uids || []).slice(-8).reverse();
        for (const uid of recent) {
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const text = msg.source.toString().replace(/<[^>]+>/g, ' ');
          const m = text.match(/Authorization code:?\s*([0-9]{5,12})/i);
          if (m) return m[1];
        }
      } finally {
        lock.release();
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
}

module.exports = { fetchAuthCode };
