import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'snake-audio');

function loadApiKey() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) throw new Error('.env nicht gefunden');
  const env = readFileSync(envPath, 'utf8');
  const match = env.match(/^ELEVEN_LABS_KEY=(.+)$/m);
  if (!match) throw new Error('ELEVEN_LABS_KEY fehlt in .env');
  return match[1].trim();
}

async function generateSoundEffect(apiKey, text, durationSeconds) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      duration_seconds: durationSeconds,
      prompt_influence: 0.45,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sound-Effect fehlgeschlagen (${res.status}): ${err}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function generateMusic(apiKey, prompt, musicLengthMs) {
  const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: musicLengthMs,
      model_id: 'music_v1',
      force_instrumental: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Musik fehlgeschlagen (${res.status}): ${err}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const ASSETS = [
  {
    file: 'bgm.mp3',
    type: 'music',
    prompt:
      'Upbeat 16-bit chiptune video game background music loop, SNES era style, playful arpeggios, bouncy square-wave melody, light drums, warm nostalgic arcade vibe, instrumental only, seamless loop feel',
    durationMs: 28000,
  },
  {
    file: 'eat.mp3',
    type: 'sfx',
    text: 'Short cheerful 16-bit retro game pickup sound, cute bug crunch blip, bright square wave, 0.3 seconds',
    durationSeconds: 0.5,
  },
  {
    file: 'crash.mp3',
    type: 'sfx',
    text: 'Retro 16-bit game over crash sound, descending buzzer, sad arcade fail, 0.6 seconds',
    durationSeconds: 0.7,
  },
];

mkdirSync(outDir, { recursive: true });

const apiKey = loadApiKey();

for (const asset of ASSETS) {
  const dest = join(outDir, asset.file);
  if (existsSync(dest) && process.env.FORCE !== '1') {
    console.log(`Überspringe ${asset.file} (existiert bereits, FORCE=1 zum Neu-Generieren)`);
    continue;
  }
  console.log(`Generiere ${asset.file} …`);
  const buf =
    asset.type === 'music'
      ? await generateMusic(apiKey, asset.prompt, asset.durationMs)
      : await generateSoundEffect(apiKey, asset.text, asset.durationSeconds);
  writeFileSync(dest, buf);
  console.log(`  → ${dest} (${(buf.length / 1024).toFixed(1)} KB)`);
}

console.log('Snake-Audio fertig.');
