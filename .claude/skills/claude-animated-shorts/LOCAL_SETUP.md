# Local setup notes (Linux / Claude Code cloud container)

Cloned from https://github.com/mromidev/claude-animated-shorts @ e3b817b (2026-11-05).
`references/frames/` and `references/sheets/` are git-ignored here (the skill says never to publish them);
re-download them from the upstream repo when a look-match pass needs them.

## Remotion workspace
Keep it outside the site repo (e.g. the session scratchpad). Pinned versions that work with `templates/bridge/`:

```json
"remotion": "4.0.540", "@remotion/cli": "4.0.540", "@remotion/three": "4.0.540",
"@remotion/bundler": "4.0.540", "@remotion/renderer": "4.0.540",
"react": "18.3.1", "react-dom": "18.3.1", "three": "0.170.0",
"@react-three/fiber": "8.18.0", "@react-three/postprocessing": "2.19.1", "postprocessing": "6.36.4"
```

- **Use React 18 + R3F 8 + @react-three/postprocessing 2.** With React 19 / R3F 9 / postprocessing 3 the
  `EffectComposer` renders nothing and every frame comes out as the plain `#cfe3f2` background.
- `npx tsc --noEmit` reports 5 harmless TS2322 errors in `Bridge.tsx` (conditional `null` children of
  `EffectComposer` in v2's types); the bundle renders fine.
- Python: `pip install numpy scipy pillow`; ffmpeg is needed by `mix.py` and `short_qa.py`.

## Rendering without a GPU
- Browser: `/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`
  with `--gl swangle` (SwiftShader). `templates/scripts/bridge-stills.mjs` hard-codes a Windows Chrome path and
  `gl: "angle"`: change both.
- Example: `npx remotion render src/index.ts TestShort out/test.mp4 --codec h264 --crf 18 --scale 0.6667
  --browser-executable <path above> --gl swangle --concurrency 3`
- Stills at `--scale 0.5` take ~16 s each on 4 CPUs.

## Assets and voice
- Kenney CC0 kits (Nature Kit + Fantasy Town Kit `.glb` files in `public/bridge/kenney/`) are not in the repo and
  kenney.nl was blocked by the container proxy. `loadKit()` skips missing models, so the world still renders
  (without trees/stalls/lanterns).
- The bridge `voice.wav` / `words.json` are not included. For tests, Piper TTS works
  (`pip install piper-tts`, voice `en_US-ryan-medium` from huggingface.co/rhasspy/piper-voices); `words.json`
  is a list of `{"w", "s", "e"}` (seconds). `audio/mix.py` reads `<workspace>/voice/voice.wav` (48 kHz) and
  `<workspace>/voice/words.json` and always builds the full 67.5 s bridge timeline.
