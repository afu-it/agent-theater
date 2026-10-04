// ElevenLabs helper. Run through the vault so the key never touches disk:
//   vault run --secret ELEVENLABS_API_KEY -- node scripts/eleven.mjs music "<prompt>" <ms> <out>
//   vault run --secret ELEVENLABS_API_KEY -- node scripts/eleven.mjs sfx "<prompt>" <seconds> <out>
import { writeFileSync } from "node:fs";
const [kind, prompt, len, out] = process.argv.slice(2);
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY missing (run through vault)");
const req =
  kind === "music"
    ? ["https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", { prompt, music_length_ms: Number(len), force_instrumental: true }]
    : ["https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192", { text: prompt, duration_seconds: Number(len), prompt_influence: 0.6 }];
const r = await fetch(req[0], { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" }, body: JSON.stringify(req[1]) });
if (!r.ok) { console.error(r.status, (await r.text()).slice(0, 400)); process.exit(1); }
writeFileSync(out, Buffer.from(await r.arrayBuffer()));
console.log("ok", out);
