#!/usr/bin/env node
/*
 * Diagnostic: lists every voice the current ELEVENLABS_API_KEY can actually
 * use via the API. Helpful when /v1/text-to-speech returns 402 — the answer
 * is always "pick a voice id that appears in this output".
 *
 * Usage: node scripts/list-elevenlabs-voices.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..');

function loadDotEnv() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function fetchVoices(apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'api.elevenlabs.io',
        path: '/v1/voices',
        method: 'GET',
        headers: { 'xi-api-key': apiKey, 'Accept': 'application/json' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 500)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  loadDotEnv();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY is not set.');
    process.exit(1);
  }

  const data = await fetchVoices(apiKey);
  const voices = Array.isArray(data.voices) ? data.voices : [];
  if (voices.length === 0) {
    console.log('No voices accessible. Free tier may require Voice Design / Instant Clone.');
    return;
  }

  console.log(`Found ${voices.length} accessible voice(s):\n`);
  for (const v of voices) {
    console.log(`  ${v.voice_id}   ${v.name}   [${v.category || '?'}]   labels=${JSON.stringify(v.labels || {})}`);
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
