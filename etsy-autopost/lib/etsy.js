// Minimal Etsy Open API v3 client. Zero dependencies (Node 18+: global fetch,
// FormData, Blob). Auth is OAuth 2.0 PKCE; tokens live in tokens.json next to
// the scripts and are refreshed automatically.
'use strict';

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://openapi.etsy.com/v3/application';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

class EtsyClient {
  constructor({ apiKey, tokensPath }) {
    if (!apiKey) throw new Error('Missing Etsy API key (keystring). See README setup.');
    this.apiKey = apiKey;
    this.tokensPath = tokensPath;
    this.tokens = null;
  }

  loadTokens() {
    if (!fs.existsSync(this.tokensPath)) {
      throw new Error(`No tokens found at ${this.tokensPath}. Run: node auth.js`);
    }
    this.tokens = JSON.parse(fs.readFileSync(this.tokensPath, 'utf8'));
    return this.tokens;
  }

  saveTokens(tokens) {
    // expires_at gives us a clock to refresh against without re-asking Etsy.
    tokens.expires_at = Date.now() + (tokens.expires_in - 60) * 1000;
    fs.writeFileSync(this.tokensPath, JSON.stringify(tokens, null, 2));
    this.tokens = tokens;
  }

  get userId() {
    // Etsy v3 access tokens are "<user_id>.<token>".
    return this.tokens.access_token.split('.')[0];
  }

  async ensureFreshToken() {
    if (!this.tokens) this.loadTokens();
    if (Date.now() < (this.tokens.expires_at || 0)) return;
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.apiKey,
        refresh_token: this.tokens.refresh_token,
      }),
    });
    if (!res.ok) {
      throw new Error(`Token refresh failed (${res.status}): ${await res.text()}\nRe-run: node auth.js`);
    }
    this.saveTokens(await res.json());
  }

  async request(method, apiPath, { json, form, urlencoded, query } = {}) {
    await this.ensureFreshToken();
    let url = API_BASE + apiPath;
    if (query) url += '?' + new URLSearchParams(query);
    const headers = {
      'x-api-key': this.apiKey,
      Authorization: `Bearer ${this.tokens.access_token}`,
    };
    let body;
    if (json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (urlencoded) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(urlencoded);
    } else if (form) {
      body = form; // fetch sets the multipart boundary itself
    }
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Etsy ${method} ${apiPath} failed (${res.status}): ${text}`);
    }
    return text ? JSON.parse(text) : null;
  }

  // Public (no user token) request — used for taxonomy lookup.
  async publicRequest(apiPath, query) {
    let url = API_BASE + apiPath;
    if (query) url += '?' + new URLSearchParams(query);
    const res = await fetch(url, { headers: { 'x-api-key': this.apiKey } });
    if (!res.ok) throw new Error(`Etsy GET ${apiPath} failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  async getShop() {
    await this.ensureFreshToken();
    const data = await this.request('GET', `/users/${this.userId}/shops`);
    // Endpoint returns the user's shop object directly.
    const shop = data.results ? data.results[0] : data;
    if (!shop || !shop.shop_id) {
      throw new Error('No Etsy shop found on this account. Open your shop at etsy.com/sell first.');
    }
    return shop;
  }

  async getSellerTaxonomyNodes() {
    const data = await this.publicRequest('/seller-taxonomy/nodes');
    return data.results || [];
  }

  createDraftListing(shopId, payload) {
    return this.request('POST', `/shops/${shopId}/listings`, { json: payload });
  }

  updateListing(shopId, listingId, patch) {
    return this.request('PATCH', `/shops/${shopId}/listings/${listingId}`, { urlencoded: patch });
  }

  async uploadListingImage(shopId, listingId, filePath, rank) {
    const form = new FormData();
    form.append('image', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
    form.append('rank', String(rank));
    return this.request('POST', `/shops/${shopId}/listings/${listingId}/images`, { form });
  }

  async uploadListingFile(shopId, listingId, filePath, name) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(filePath)]), name);
    form.append('name', name);
    return this.request('POST', `/shops/${shopId}/listings/${listingId}/files`, { form });
  }
}

module.exports = { EtsyClient, TOKEN_URL };
