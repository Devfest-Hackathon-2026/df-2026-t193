/**
 * Generates prerecorded guidance audio with Google Cloud Text-to-Speech (Chirp 3: HD).
 * Text comes only from the reviewed flow + fixed copy (speechVariants), never from a model.
 *
 *   npm run voice:generate                        # all sentences → public/assets/tonari/voice/
 *   npm run voice:generate -- --samples <dir>     # one sentence in several voices, for choosing
 *   options: --voice ja-JP-Chirp3-HD-Kore --rate 0.9
 *
 * Auth: `gcloud auth login` and a project with texttospeech.googleapis.com enabled
 * (GOOGLE_CLOUD_PROJECT or `gcloud config set project`). The access token stays in memory.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoFlow as flow } from '../src/api/demo';
import { fixedSpeech, speechVariants } from '../src/content/speech';
import type { VoiceManifest } from '../src/content/voice';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const voice = option('voice', 'ja-JP-Chirp3-HD-Kore');
const rate = Number(option('rate', '0.9'));
const samples = args.includes('--samples') ? option('samples', '') : null;
if (!/^ja-JP-Chirp3-HD-[A-Za-z]+$/.test(voice)) throw new Error(`Unexpected voice name: ${voice}`);
if (!(rate >= 0.25 && rate <= 2)) throw new Error('--rate must be between 0.25 and 2');
if (samples === '') throw new Error('--samples needs an output directory');

const gcloud = (...a: string[]) => execFileSync('gcloud', a, { encoding: 'utf8' }).trim();
const project = process.env.GOOGLE_CLOUD_PROJECT || gcloud('config', 'get-value', 'project');
if (!project) throw new Error('No Google Cloud project. Set GOOGLE_CLOUD_PROJECT or gcloud config.');
const token = gcloud('auth', 'print-access-token');

async function synthesize(text: string, name: string) {
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': project,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'ja-JP', name },
      audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
    }),
  });
  if (!response.ok)
    throw new Error(`Text-to-Speech ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const { audioContent } = (await response.json()) as { audioContent?: string };
  if (!audioContent) throw new Error('Text-to-Speech returned no audio');
  return Buffer.from(audioContent, 'base64');
}

const variants = speechVariants(flow);
if (samples !== null) {
  const dir = resolve(samples);
  mkdirSync(dir, { recursive: true });
  const text = variants.find((v) => v.file === 's1-first')!.text;
  for (const name of ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Charon', 'Puck']) {
    const file = join(dir, `${name}.mp3`);
    writeFileSync(file, await synthesize(text, `ja-JP-Chirp3-HD-${name}`));
    console.log(file);
  }
} else {
  const root = resolve(here, '../public/assets/tonari/voice');
  let chars = 0;
  const render = async (folder: string, list: { file: string; text: string }[]) => {
    const dir = join(root, folder);
    mkdirSync(dir, { recursive: true });
    for (const file of readdirSync(dir)) if (file.endsWith('.mp3')) rmSync(join(dir, file));
    const items: Record<string, string> = {};
    for (const { file, text } of list) {
      writeFileSync(join(dir, `${file}.mp3`), await synthesize(text, voice));
      items[text] = `/assets/tonari/voice/${folder}/${file}.mp3`;
      chars += text.length;
      console.log(`${folder}/${file}.mp3`);
    }
    return items;
  };
  const items = await render(`${flow.flow_id}-v${flow.version}`, variants);
  const common = await render('common', fixedSpeech());
  const manifest: VoiceManifest = {
    flow_id: flow.flow_id,
    version: flow.version,
    voice,
    speaking_rate: rate,
    items,
    common,
  };
  writeFileSync(
    resolve(here, '../src/content/voice-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `${Object.keys(items).length + Object.keys(common).length} files, ${chars} characters, voice ${voice}, rate ${rate}`,
  );
}
