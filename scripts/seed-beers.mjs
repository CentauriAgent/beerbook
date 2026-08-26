#!/usr/bin/env node
/**
 * Beerbot beer seeder — publishes kind 31006 beer records to Nostr.
 *
 * Source: catalog.beer REST API (data licensed CC BY 4.0, attribution included
 * as a `source` tag on every event). If no catalog.beer API key is available,
 * falls back to a small built-in starter list so the publish flow can be
 * verified.
 *
 * Usage:
 *   node scripts/seed-beers.mjs --count 10        # seed N beers (default 10)
 *   node scripts/seed-beers.mjs --count 300       # test run of 300
 *   node scripts/seed-beers.mjs --profile         # publish bot kind 0 only
 *   node scripts/seed-beers.mjs --dry-run         # don't publish, print events
 *
 * API key: CATALOG_BEER_KEY env var, or ~/.beerbot/catalog.key file.
 * Rate limits: ~1 req/sec to catalog.beer, ~1 event/sec to relays.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SimplePool, finalizeEvent } from 'nostr-tools';

const BEERBOT_PUBKEY = '89bb8966cf7f756ed8dbad2027aa04b0151e5279aee3eb725109503a9fc836aa';
const RELAYS = ['wss://relay.ditto.pub', 'wss://relay.primal.net', 'wss://nos.lol'];
const BEER_KIND = 31006;
const CATALOG_BASE = 'https://api.catalog.beer/v1/beers';

// --- args ---
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const profileOnly = args.includes('--profile');
const countIdx = args.indexOf('--count');
const COUNT = countIdx !== -1 ? Math.max(1, Number(args[countIdx + 1]) || 10) : 10;

// --- keys ---
const sk = Buffer.from(readFileSync(join(homedir(), '.beerbot/secret.hex'), 'utf8').trim(), 'hex');
const pool = new SimplePool();

function catalogKey() {
  if (process.env.CATALOG_BEER_KEY) return process.env.CATALOG_BEER_KEY;
  try { return readFileSync(join(homedir(), '.beerbot/catalog.key'), 'utf8').trim() || null; } catch { return null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function beerSlug(name, brewery) {
  return `${brewery} ${name}`.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildBeerEvent(b) {
  const d = beerSlug(b.name, b.brewery);
  const tags = [
    ['d', d],
    ['name', b.name],
    ['client', 'beerbook'],
    ['source', 'catalog.beer'],
    ['license', 'CC-BY-4.0'],
  ];
  if (b.brewery) tags.push(['brewery', b.brewery]);
  if (b.style) tags.push(['style', b.style]);
  if (b.abv) tags.push(['abv', String(b.abv)]);
  if (b.ibu) tags.push(['ibu', String(b.ibu)]);
  if (b.description) tags.push(['description', b.description]);
  if (b.image) tags.push(['image', b.image]);
  return { kind: BEER_KIND, content: b.description ?? '', tags, created_at: Math.floor(Date.now() / 1000) };
}

/** Fallback starter list used only when no catalog.beer key is configured. */
function starterBeers(n) {
  const list = [
    ['Pliny the Elder', 'Russian River Brewing Company', 'Double IPA', 8.0, 100],
    ['Heady Topper', 'The Alchemist', 'IPA', 8.0, 75],
    ['Zombie Dust', '3 Floyds Brewing', 'American Pale Ale', 6.2, 50],
    ['Two Hearted Ale', 'Bell\'s Brewery', 'American IPA', 7.0, 55],
    ['Founders Breakfast Stout', 'Founders Brewing', 'Imperial Stout', 8.3, 60],
    ['Sculpin IPA', 'Ballast Point Brewing', 'IPA', 7.0, 70],
    ['Westmalle Trappist Tripel', 'Brouwerij Westmalle', 'Tripel', 9.5, 35],
    ['Weihenstephaner Hefeweissbier', 'Bayerische Staatsbrauerei Weihenstephan', 'Hefeweizen', 5.4, 14],
    ['Guinness Draught', 'St. James\'s Gate Brewery', 'Dry Stout', 4.2, 45],
    ['Pilsner Urquell', 'Plzeňský Prazdroj', 'Czech Pilsner', 4.4, 40],
    ['Duvel', 'Brouwerij Duvel Moortgat', 'Belgian Strong Golden Ale', 8.5, 28],
    ['Orval Trappist Ale', 'Brasserie d\'Orval', 'Belgian Pale Ale', 6.2, 36],
    ['Parabola', 'Firestone Walker Brewing', 'Russian Imperial Stout', 14.5, 80],
    ['Juicy Haze', 'New Belgium Brewing', 'Hazy IPA', 6.0, 25],
    ['La Fin du Monde', 'Unibroue', 'Belgian Tripel', 9.0, 22],
    ['Bigfoot Barleywine', 'Sierra Nevada Brewing', 'Barleywine', 9.6, 90],
    ['Samuel Adams Boston Lager', 'Boston Beer Company', 'Vienna Lager', 4.9, 30],
    ['Augustiner Helles', 'Augustiner-Bräu', 'Munich Helles', 5.2, 18],
    ['Kentucky Breakfast Stout', 'Founders Brewing', 'Imperial Stout', 11.6, 70],
    ['Samichlaus Classic', 'Schloss Eggenberg', 'Doppelbock', 14.0, 35],
    ['Budweiser', 'Anheuser-Busch', 'American Lager', 5.0, 12],
    ['Corona Extra', 'Grupo Modelo', 'Mexican Lager', 4.5, 19],
    ['Blue Moon Belgian White', 'Blue Moon Brewing', 'Witbier', 5.4, 9],
    ['Lagunitas IPA', 'Lagunitas Brewing', 'IPA', 6.2, 51],
    ['Hazy Little Thing', 'Sierra Nevada Brewing', 'Hazy IPA', 6.7, 40],
    ['Hopsecutioner', 'Terrapin Beer Company', 'IPA', 7.3, 73],
    ['Rodenbach Grand Cru', 'Brouwerij Rodenbach', 'Flanders Red', 6.0, 26],
    ['Duchesse de Bourgogne', 'Brouwerij Verhaeghe', 'Flanders Red', 6.2, 20],
    ['Celebrator Doppelbock', 'Ayinger Brewery', 'Doppelbock', 6.7, 24],
    ['Saison Dupont', 'Brasserie Dupont', 'Saison', 6.5, 28],
  ];
  return list.slice(0, n).map(([name, brewery, style, abv, ibu]) => ({
    name, brewery, style, abv, ibu, description: `${style} from ${brewery}.`,
    source: 'starter',
  }));
}

async function fetchCatalogBeers(count) {
  const key = catalogKey();
  const headers = { accept: 'application/json' };
  if (key) headers['authorization'] = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;

  const perPage = 50;
  const beers = [];
  let cursor = null;
  while (beers.length < count) {
    const want = Math.min(perPage, count - beers.length);
    const url = `https://api.catalog.beer/beer?count=${want}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    console.log(`catalog.beer: GET ${beers.length ? `+${want}` : 'first page'}…`);
    const res = await fetch(url, { headers });
    if (res.status === 401 || res.status === 403) {
      throw new Error('catalog.beer: API key required/invalid (HTTP ' + res.status + ')');
    }
    if (!res.ok) throw new Error(`catalog.beer: HTTP ${res.status}`);
    const json = await res.json();
    const items = json.data ?? [];
    for (const b of items) {
      beers.push({
        name: b.name,
        brewery: b.brewer?.name ?? (typeof b.brewer === 'string' ? b.brewer : ''),
        style: b.style ?? undefined,
        abv: b.abv ?? undefined,
        ibu: b.ibu ?? undefined,
        description: b.description || undefined,
        image: undefined, // list endpoint has no image; detail fetch optional later
        source: 'catalog.beer',
      });
    }
    console.log(`  +${items.length} (total ${beers.length})`);
    if (!json.has_more || !json.next_cursor || items.length === 0) break;
    cursor = json.next_cursor;
    await sleep(1100); // ~1 req/sec
  }
  return beers.slice(0, count);
  return beers.slice(0, count);
}

async function publishProfile() {
  const profile = {
    name: 'Beerbot',
    about: 'Decentralized beer inventory for Beerbook. Data seeded from catalog.beer (CC BY 4.0)',
    picture: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/1f37a.png',
    display_name: 'Beerbot 🍺',
    website: 'https://beerbook-test.surge.sh',
  };
  const template = { kind: 0, content: JSON.stringify(profile), tags: [['client', 'beerbook']], created_at: Math.floor(Date.now() / 1000) };
  const event = finalizeEvent(template, sk);
  if (dryRun) { console.log('[dry-run] kind 0:', JSON.stringify(event, null, 2)); return; }
  try {
    const pubs = await Promise.allSettled(RELAYS.map((r) => pool.publish([r], event)));
    pubs.forEach((p, i) => console.log(`kind 0 → ${RELAYS[i]}: ${p.status === 'fulfilled' ? 'ok' : p.reason?.message ?? 'failed'}`));
  } catch (err) {
    console.log(`kind 0 publish warning: ${err?.message ?? err} (continuing)`);
  }
}

async function main() {
  console.log(`Beerbot seeder — pubkey ${BEERBOT_PUBKEY}`);
  await publishProfile();
  if (profileOnly) { pool.close(RELAYS); return; }

  let beers;
  try {
    beers = await fetchCatalogBeers(COUNT);
    console.log(`Fetched ${beers.length} beers from catalog.beer`);
  } catch (err) {
    console.warn(`${err.message} — falling back to built-in starter list (own data, no catalog attribution)`);
    beers = starterBeers(Math.min(COUNT, 30));
  }

  let ok = 0;
  for (const b of beers) {
    const template = buildBeerEvent(b);
    const event = finalizeEvent(template, sk);
    const slug = template.tags.find(([n]) => n === 'd')[1];
    if (dryRun) {
      console.log(`[dry-run] ${slug} — ${b.name} (${b.brewery})`);
    } else {
      const pubs = await Promise.allSettled(RELAYS.map((r) => pool.publish([r], event)));
      const okCount = pubs.filter((p) => p.status === 'fulfilled').length;
      if (okCount > 0) ok++;
      console.log(`${okCount > 0 ? '✅' : '❌'} ${slug} — ${b.name} (${okCount}/${RELAYS.length} relays)`);
    }
    await sleep(1100); // don't spam relays
  }
  console.log(`Done: ${dryRun ? beers.length : ok}/${beers.length} events ${dryRun ? 'validated' : 'published'} to ${RELAYS.join(', ')}`);
  pool.close(RELAYS);
}

main().catch((e) => { console.error(e); process.exit(1); });
