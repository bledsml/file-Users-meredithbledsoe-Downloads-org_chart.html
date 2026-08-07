#!/usr/bin/env node
// One-time Etsy sign-in (OAuth 2.0 PKCE). Prints a URL to open in your
// browser; after you click "Grant access" the tokens are saved to
// tokens.json and every other command works from then on.
//
// Usage: node auth.js
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { TOKEN_URL } = require('./lib/etsy');

const PORT = 4477;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'listings_r listings_w shops_r';

function loadConfig() {
  const p = path.join(__dirname, 'etsy.config.json');
  if (!fs.existsSync(p)) {
    console.error('Missing etsy.config.json. Copy etsy.config.example.json to etsy.config.json');
    console.error('and paste in your Etsy app keystring (see README, step 1).');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function main() {
  const config = loadConfig();
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const authUrl =
    'https://www.etsy.com/oauth/connect?' +
    new URLSearchParams({
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      client_id: config.apiKey,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    try {
      if (url.searchParams.get('state') !== state) throw new Error('State mismatch, try again.');
      const code = url.searchParams.get('code');
      if (!code) throw new Error(`Etsy returned an error: ${url.searchParams.get('error_description') || url.search}`);

      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.apiKey,
          redirect_uri: REDIRECT_URI,
          code,
          code_verifier: verifier,
        }),
      });
      if (!tokenRes.ok) throw new Error(`Token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
      const tokens = await tokenRes.json();
      tokens.expires_at = Date.now() + (tokens.expires_in - 60) * 1000;
      fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(tokens, null, 2));

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Connected to Etsy. You can close this tab and go back to the terminal.</h2>');
      console.log('\nSuccess! Tokens saved to tokens.json.');
      console.log('Next: node post.js status');
      server.close();
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Something went wrong: ' + err.message);
      console.error('\nAuth failed:', err.message);
      server.close();
      process.exitCode = 1;
    }
  });

  server.listen(PORT, () => {
    console.log('1. Make sure your Etsy app lists this callback URL:', REDIRECT_URI);
    console.log('2. Open this link in your browser and click "Grant access":\n');
    console.log(authUrl + '\n');
    console.log('Waiting for Etsy to redirect back...');
  });
}

main();
