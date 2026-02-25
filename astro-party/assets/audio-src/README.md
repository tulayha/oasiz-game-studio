Place raw audio source files in this folder, then run:

- `bun run process:audio`

The script reads expected output filenames from `src/audio/assetManifest.ts` and converts
matching source files into `public/assets/audio` using `ffmpeg`.

Current output format:
- `.ogg` using Vorbis (`libvorbis`) at high quality (`-q:a 7`), 44.1kHz stereo

Source matching rules:
- Exact path match: `assets/audio-src/<relativePath from manifest>`
- Fallback match: same basename with a supported extension (`.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a`, `.aif`, `.aiff`)

Useful options:
- `bun run process:audio -- --dry-run`
- `bun run process:audio -- --src path/to/raw-audio`
- `bun run process:audio -- --out public/assets/audio`
- `bun run process:audio -- --ffmpeg-bin ffmpeg`

Expected output filenames in `public/assets/audio`:
- music-cue-splash.ogg
- music-cue-logo.ogg
- music-loop-menu.ogg
- music-loop-gameplay.ogg
- music-loop-results.ogg
- sfx-fire.ogg
- sfx-explosion.ogg
- sfx-hit.ogg
- sfx-dash.ogg
- sfx-countdown.ogg
- sfx-fight.ogg
- sfx-win.ogg
- sfx-kill.ogg
- sfx-respawn.ogg
- sfx-ui-click.ogg
- sfx-pilot-eject.ogg
- sfx-pilot-death.ogg
