#!/usr/bin/env node
// Confetti & Co. → Etsy auto-poster.
//
// Turns the invitation packs in listings.json into Etsy DRAFT listings via the
// official Etsy Open API v3: creates the listing, uploads the cover + design
// images, and attaches the design PDFs as the digital download files. Drafts
// are free and never visible to buyers — you publish from Etsy (or with
// --publish) when you're happy with them.
//
// Usage:
//   node post.js status                     what's in the queue vs already posted
//   node post.js post --next [--dry-run]    post the next unposted listing
//   node post.js post --key birthday        post one specific listing
//   node post.js post --all                 post everything not yet posted
//   node post.js find-taxonomy [words]      look up Etsy category ids
//
// Flags:
//   --singles      include one listing per individual design (30 extra listings)
//   --publish      set the listing live immediately (Etsy charges $0.20/listing)
//   --dry-run      print what would be posted without calling Etsy
//   --assets DIR   override the designs folder from etsy.config.json
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EtsyClient } = require('./lib/etsy');

const HERE = __dirname;
const STATE_PATH = path.join(HERE, 'state.json');

// ---------- config / data ----------

function loadConfig() {
  const defaults = {
    apiKey: process.env.ETSY_API_KEY || '',
    assetsDir: path.join(os.homedir(), 'Desktop', 'AI Meredith', 'Invitation Small Business Bazaar'),
    taxonomyId: null, // auto-resolved to Etsy's "Invitations" category on first post
    whenMade: '2020_2026',
    quantity: 999,
  };
  const p = path.join(HERE, 'etsy.config.json');
  const config = fs.existsSync(p) ? { ...defaults, ...JSON.parse(fs.readFileSync(p, 'utf8')) } : defaults;
  if (config.assetsDir.startsWith('~')) {
    config.assetsDir = path.join(os.homedir(), config.assetsDir.slice(1));
  }
  return config;
}

function loadData() {
  return JSON.parse(fs.readFileSync(path.join(HERE, 'listings.json'), 'utf8'));
}

function loadState() {
  return fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : { posted: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ---------- asset lookup ----------

let assetIndex = null;

function indexAssets(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Designs folder not found: ${dir}\n` +
        'Point me at your design files with --assets <folder>, or set "assetsDir" in etsy.config.json.\n' +
        'The files are in your Google Drive folder "Invitation Small Business Bazaar" — download it anywhere and pass that path.'
    );
  }
  const files = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  })(dir);
  return files;
}

// Filenames carry version/date suffixes (BirthdayInvite_Cozy_v1_06132026.pdf),
// so match on prefix + extension.
function findAsset(dir, base, ext) {
  if (!assetIndex) assetIndex = indexAssets(dir);
  const prefix = base.toLowerCase();
  const suffix = '.' + ext.toLowerCase();
  const hit = assetIndex.find((f) => {
    const name = path.basename(f).toLowerCase();
    return name.startsWith(prefix) && name.endsWith(suffix);
  });
  if (!hit) throw new Error(`Could not find "${base}*.${ext}" under ${dir}`);
  return hit;
}

// ---------- queue ----------

function buildQueue(data, { singles }) {
  const jobs = [];
  for (const pack of data.packs) {
    jobs.push({
      key: pack.key,
      kind: 'pack',
      title: pack.title,
      description: pack.description,
      tags: pack.tags,
      price: pack.price,
      images: [pack.cover, ...pack.designs.map((d) => d.base)],
      files: pack.designs.map((d) => ({ base: d.base, ext: 'pdf' })),
    });
  }
  if (singles) {
    for (const pack of data.packs) {
      for (const design of pack.designs) {
        jobs.push({
          key: `${pack.key}-${design.base.split('_').pop().toLowerCase()}`,
          kind: 'single',
          title: `Editable ${pack.occasion} Invitation, ${design.name} Design, 5x7 Printable (Instant Download)`,
          description:
            `A single design from our ${pack.occasion} collection: ${design.name}.\n\n` +
            `Love the whole set? The full 5-design pack is in our shop.\n\n` +
            pack.description,
          tags: pack.tags,
          price: pack.singlePrice,
          images: [design.base],
          files: [
            { base: design.base, ext: 'pdf' },
            { base: design.base, ext: 'png' },
          ],
        });
      }
    }
  }
  return jobs;
}

// ---------- tag/title guards (Etsy limits: 13 tags, 20 chars each, 140-char title) ----------

function sanitizeTags(tags) {
  return [...new Set(tags.map((t) => t.trim().slice(0, 20)))].slice(0, 13);
}

// ---------- taxonomy ----------

function flattenTaxonomy(nodes, out = []) {
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, path: n.full_path_taxonomy_ids });
    if (n.children && n.children.length) flattenTaxonomy(n.children, out);
  }
  return out;
}

async function resolveTaxonomyId(client, config, state) {
  if (config.taxonomyId) return config.taxonomyId;
  if (state.taxonomyId) return state.taxonomyId;
  const flat = flattenTaxonomy(await client.getSellerTaxonomyNodes());
  // Prefer the exact "Invitations" node; fall back to anything invitation-like.
  const node =
    flat.find((n) => n.name.toLowerCase() === 'invitations') ||
    flat.find((n) => /invitation/i.test(n.name));
  if (!node) throw new Error('Could not find an "Invitations" Etsy category. Run: node post.js find-taxonomy invitation');
  console.log(`Using Etsy category "${node.name}" (taxonomy_id ${node.id})`);
  state.taxonomyId = node.id;
  saveState(state);
  return node.id;
}

// ---------- posting ----------

async function postJob(client, shopId, job, config, { publish, dryRun }) {
  const images = job.images.map((base) => findAsset(config.assetsDir, base, 'png'));
  const files = job.files.map((f) => ({
    path: findAsset(config.assetsDir, f.base, f.ext),
    name: path.basename(findAsset(config.assetsDir, f.base, f.ext)),
  }));

  console.log(`\n=== ${job.key} (${job.kind}) — $${job.price.toFixed(2)}`);
  console.log(`    ${job.title}`);
  console.log(`    images: ${images.map((f) => path.basename(f)).join(', ')}`);
  console.log(`    files:  ${files.map((f) => f.name).join(', ')}`);

  if (dryRun) {
    console.log('    [dry-run] nothing sent to Etsy');
    return null;
  }

  const state = loadState();
  const taxonomyId = await resolveTaxonomyId(client, config, state);

  const listing = await client.createDraftListing(shopId, {
    quantity: config.quantity,
    title: job.title.slice(0, 140),
    description: job.description,
    price: job.price,
    who_made: 'i_did',
    when_made: config.whenMade,
    taxonomy_id: taxonomyId,
    type: 'download',
    tags: sanitizeTags(job.tags),
    should_auto_renew: true,
  });
  const listingId = listing.listing_id;
  console.log(`    draft created: listing ${listingId}`);

  for (let i = 0; i < images.length; i++) {
    await client.uploadListingImage(shopId, listingId, images[i], i + 1);
    console.log(`    image ${i + 1}/${images.length} uploaded`);
  }
  for (const f of files) {
    await client.uploadListingFile(shopId, listingId, f.path, f.name);
    console.log(`    file uploaded: ${f.name}`);
  }

  let finalState = 'draft';
  if (publish) {
    await client.updateListing(shopId, listingId, { state: 'active' });
    finalState = 'active';
    console.log('    published (Etsy charges the $0.20 listing fee now)');
  } else {
    console.log('    left as DRAFT — review and publish from Etsy Shop Manager');
  }

  state.posted[job.key] = {
    listing_id: listingId,
    state: finalState,
    at: new Date().toISOString(),
    url: `https://www.etsy.com/listing/${listingId}`,
  };
  saveState(state);
  return listingId;
}

// ---------- CLI ----------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--assets' || a === '--key') args[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
    else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'status';
  const config = loadConfig();
  if (args.assets) config.assetsDir = args.assets;
  const data = loadData();
  const state = loadState();
  const queue = buildQueue(data, { singles: !!args.singles });

  if (command === 'status') {
    console.log(`Shop: ${data.shopName}`);
    console.log(`Queue (${queue.length} listings${args.singles ? ', including singles' : ' — add --singles for 30 more'}):\n`);
    for (const job of queue) {
      const done = state.posted[job.key];
      console.log(
        `  [${done ? 'x' : ' '}] ${job.key.padEnd(24)} $${String(job.price.toFixed(2)).padEnd(6)}` +
          (done ? ` → ${done.url} (${done.state})` : '')
      );
    }
    const remaining = queue.filter((j) => !state.posted[j.key]).length;
    console.log(`\n${remaining} left to post. Next: node post.js post --next`);
    return;
  }

  if (command === 'find-taxonomy') {
    const client = new EtsyClient({ apiKey: config.apiKey, tokensPath: path.join(HERE, 'tokens.json') });
    const q = (args._[1] || 'invitation').toLowerCase();
    const flat = flattenTaxonomy(await client.getSellerTaxonomyNodes());
    for (const n of flat.filter((n) => n.name.toLowerCase().includes(q))) {
      console.log(`  ${String(n.id).padEnd(8)} ${n.name}`);
    }
    return;
  }

  if (command === 'post') {
    const jobs = args.all
      ? queue.filter((j) => !state.posted[j.key])
      : args.key
        ? queue.filter((j) => j.key === args.key)
        : args.next
          ? queue.filter((j) => !state.posted[j.key]).slice(0, 1)
          : [];
    if (!jobs.length) {
      console.log(args.key ? `No listing named "${args.key}". Run: node post.js status` : 'Nothing left to post!');
      return;
    }
    if (args.key && state.posted[args.key] && !args.force) {
      console.log(`"${args.key}" was already posted (${state.posted[args.key].url}). Re-post with --force.`);
      return;
    }

    let client = null;
    let shopId = null;
    if (!args['dry-run']) {
      client = new EtsyClient({ apiKey: config.apiKey, tokensPath: path.join(HERE, 'tokens.json') });
      const shop = await client.getShop();
      shopId = shop.shop_id;
      console.log(`Connected to Etsy shop: ${shop.shop_name} (${shopId})`);
    }
    for (const job of jobs) {
      await postJob(client, shopId, job, config, { publish: !!args.publish, dryRun: !!args['dry-run'] });
    }
    return;
  }

  console.error(`Unknown command "${command}". Commands: status, post, find-taxonomy`);
  process.exit(1);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
