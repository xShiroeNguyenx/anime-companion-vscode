#!/usr/bin/env node
/*
 * Generate ElevenLabs MP3 assets for every language config under media/voice/.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... node scripts/generate-voice-assets.js [flags]
 *
 * Flags:
 *   --force, -f          Regenerate every line even when hashes still match.
 *   --lang=en,vi         Only process the listed language configs.
 *   --key=k1,k2          Only process lines whose key is in the list. All other
 *                        lines are ignored entirely (no hash check, no API call) —
 *                        use this to add a brand-new line without risking regen
 *                        of the existing ones if voiceSettings drifted.
 *
 * Reads .env from the repo root if present (KEY=VALUE lines, ignores #-comments).
 * Idempotent: hashes (text + voiceId + modelId + voiceSettings) per line and
 * skips work when an existing {key}.hash next to the MP3 still matches.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..');
const VOICE_CONFIG_DIR = path.join(REPO_ROOT, 'media', 'voice');
const OUT_ROOT = path.join(REPO_ROOT, 'dist', 'voice-assets');
const ELEVENLABS_HOST = 'api.elevenlabs.io';

function loadDotEnv() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
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

// Strip // line comments and /* */ block comments outside of strings, plus
// trailing commas before ] or }, so voice configs can be partially commented
// out while remaining parseable.
function parseJsonWithComments(text) {
  let out = '';
  let i = 0;
  let inString = false;
  let stringChar = null;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      if (ch === '\\' && i + 1 < text.length) {
        out += ch + text[i + 1];
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = null;
      }
      out += ch;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  out = out.replace(/,(\s*[\]}])/g, '$1');
  return JSON.parse(out);
}

function parseArgs(argv) {
  const out = { force: false, langs: null, keys: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--force' || arg === '-f') out.force = true;
    else if (arg.startsWith('--lang=')) out.langs = arg.slice('--lang='.length).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith('--key=')) out.keys = arg.slice('--key='.length).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

function hashLine(line, voiceId, modelId, voiceSettings) {
  const payload = JSON.stringify({
    text: line.text,
    voiceId,
    modelId,
    voiceSettings,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function ttsRequest({ apiKey, voiceId, modelId, voiceSettings, text }) {
  return new Promise((resolve, reject) => {
    const settings = {
      stability: voiceSettings.stability,
      similarity_boost: voiceSettings.similarityBoost,
      style: voiceSettings.style,
      use_speaker_boost: voiceSettings.useSpeakerBoost,
    };
    if (typeof voiceSettings.speed === 'number') {
      settings.speed = voiceSettings.speed;
    }
    const body = JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: settings,
    });

    const req = https.request(
      {
        host: ELEVENLABS_HOST,
        path: `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(buf);
          } else {
            reject(new Error(`ElevenLabs HTTP ${res.statusCode}: ${buf.toString('utf8').slice(0, 500)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function processLanguage(configPath, opts, apiKey) {
  const config = parseJsonWithComments(fs.readFileSync(configPath, 'utf8'));
  const lang = config.language;
  if (!lang) throw new Error(`${configPath}: missing "language"`);
  if (opts.langs && !opts.langs.includes(lang)) {
    console.log(`[skip] ${lang}: not in --lang filter`);
    return { lang, generated: 0, skipped: 0, total: 0 };
  }

  const outDir = path.join(OUT_ROOT, lang);
  fs.mkdirSync(outDir, { recursive: true });

  const lines = Array.isArray(config.lines) ? config.lines : [];
  let generated = 0;
  let skipped = 0;
  const manifest = { language: lang, voiceId: config.voiceId, modelId: config.modelId, lines: [] };

  for (const line of lines) {
    if (!line || !line.key || !line.text) {
      console.warn(`[warn] ${lang}: skipping malformed line entry: ${JSON.stringify(line)}`);
      continue;
    }
    const hash = hashLine(line, config.voiceId, config.modelId, config.voiceSettings);
    manifest.lines.push({ key: line.key, hash });

    if (opts.keys && !opts.keys.includes(line.key)) {
      // Surgical mode: line not in --key filter — leave existing MP3/hash on
      // disk untouched, no API call. Manifest still includes it so the
      // registry stays complete.
      console.log(`[ignr] ${lang}/${line.key}.mp3 (not in --key filter)`);
      continue;
    }
    const mp3Path = path.join(outDir, `${line.key}.mp3`);
    const hashPath = path.join(outDir, `${line.key}.hash`);

    const existingHash = fs.existsSync(hashPath) ? fs.readFileSync(hashPath, 'utf8').trim() : null;
    const upToDate = !opts.force && existingHash === hash && fs.existsSync(mp3Path);

    if (upToDate) {
      console.log(`[skip] ${lang}/${line.key}.mp3 (hash match)`);
      skipped++;
    } else {
      console.log(`[gen ] ${lang}/${line.key}.mp3 ...`);
      const mp3 = await ttsRequest({
        apiKey,
        voiceId: config.voiceId,
        modelId: config.modelId,
        voiceSettings: config.voiceSettings,
        text: line.text,
      });
      fs.writeFileSync(mp3Path, mp3);
      fs.writeFileSync(hashPath, hash + '\n');
      generated++;
    }
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { lang, generated, skipped, total: lines.length };
}

async function main() {
  loadDotEnv();
  const opts = parseArgs(process.argv);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY is not set. Add it to .env or export it before running.');
    process.exit(1);
  }

  if (!fs.existsSync(VOICE_CONFIG_DIR)) {
    console.error(`Voice config dir not found: ${VOICE_CONFIG_DIR}`);
    process.exit(1);
  }

  const configFiles = fs.readdirSync(VOICE_CONFIG_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(VOICE_CONFIG_DIR, f));

  if (configFiles.length === 0) {
    console.error(`No *.json voice configs in ${VOICE_CONFIG_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_ROOT, { recursive: true });

  const summaries = [];
  for (const cfg of configFiles) {
    summaries.push(await processLanguage(cfg, opts, apiKey));
  }

  console.log('\n=== voice-assets summary ===');
  for (const s of summaries) {
    console.log(`  ${s.lang}: ${s.generated} generated, ${s.skipped} skipped, ${s.total} total`);
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
