# Frame

A serverless Next.js MKV player with shadcn/ui. Paste a direct video URL, start playback, and select an audio language without losing the current position.

## Run

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Production: `pnpm build` then `pnpm start`, or deploy the Next.js project to a serverless host such as Vercel. No API routes, FFmpeg processes, credentials, database, or media server are required.

## Architecture

- `app/page.tsx` is a React Server Component.
- `components/player/video-player.tsx` is the interactive Client Component.
- `lib/player/engine.ts` progressively reads and demuxes media using Mediabunny, decodes frames to a canvas with WebCodecs, and schedules audio against a shared Web Audio clock. Audio changes restart decoding at the current position and preserve play/pause state.
- The source cache is capped at 32 MiB. Decoded queues and canvas allocations are bounded. Closing/replacing a source disposes requests, iterators, audio nodes, and decoders.
- AC-3/E-AC-3 and DTS decoders load in the browser. No video is uploaded or sent through the app server. The video host still receives the browser's requests.

## Source and browser requirements

Use a direct URL to a file, including signed URLs. URLs do not need to end in `.mkv`. The host must permit CORS access from the deployed app. For reliable progressive playback and seeking, support byte range requests and expose `Content-Range`, `Content-Length`, and `Accept-Ranges`. For example:

```http
Access-Control-Allow-Origin: https://your-player.example
Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges
Accept-Ranges: bytes
```

If the host handles preflight requests, allow `GET`, `HEAD`, and the `Range` header. A successful partial response should return status `206` and a valid `Content-Range`. Without ranges, the host may force a much larger sequential download.

WebCodecs requires HTTPS (localhost also works). Video decoding depends on the browser/device: H.264, VP8/VP9, AV1, and HEVC availability varies. Unsupported codecs produce a specific error; unsupported audio tracks are disabled. Modern Chromium is a useful baseline. AC-3, E-AC-3 and DTS use WASM decoders; other audio codecs use the browser.

DRM, embedded subtitles, cookie-authenticated sources, streaming service webpages, and live streams are outside this player's scope. Playback pauses when the tab is hidden. A fully universal player for arbitrary codecs or sources without CORS requires a separate media processing/proxy service; a Server Component alone cannot provide that.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm build
```

If a restricted environment prevents Turbopack's CSS worker from opening a loopback socket, `pnpm exec next build --webpack` provides the supported build fallback.

Manual playback check: serve a short MKV with two differently tagged audio tracks from a CORS-enabled host (or temporarily from `public/`), load it, pause, change language, seek, resume, and replay at the end. Test an invalid URL and an unreachable source as well. Development test media is not shipped.

Upstream references: [Mediabunny formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs), [media sinks](https://mediabunny.dev/guide/media-sinks), and [shadcn/ui](https://ui.shadcn.com/docs).
