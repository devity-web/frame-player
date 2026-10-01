"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  ArrowRight,
  AudioLines,
  Check,
  CircleAlert,
  Film,
  Link2,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MkvPlayer,
  validateMediaUrl,
  type MediaInfo,
  type PlaybackState,
} from "@/lib/player/engine"

function formatTime(seconds: number) {
  const time = Math.floor(Math.max(0, seconds))
  const hours = Math.floor(time / 3600)
  return `${hours ? `${hours}:` : ""}${String(Math.floor(time / 60) % 60).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`
}

function messageFor(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong while opening the video."
  if (/not granted|fullscreen/i.test(message))
    return "Fullscreen could not be opened. Your browser may require you to focus this tab and click the fullscreen button again."
  if (
    /fetch|network|cors|HTTP (?:error|status)|request failed|failed to load/i.test(
      message
    )
  )
    return "The video could not be reached. Check that the URL points directly to a video file and that its host allows CORS access. Expired links may need to be replaced."
  return message
}

export function VideoPlayer() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const playerSurface = useRef<HTMLElement>(null)
  const player = useRef<MkvPlayer | null>(null)
  const request = useRef(0)
  const [url, setUrl] = useState("")
  const [filename, setFilename] = useState("")
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState("")
  const [playback, setPlayback] = useState<PlaybackState>({
    time: 0,
    playing: false,
    buffering: false,
  })
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)
  const [seekValue, setSeekValue] = useState<number | null>(null)
  const seekRef = useRef<number | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(
    () => () => {
      request.current++
      player.current?.dispose()
    },
    []
  )
  useEffect(() => {
    player.current?.setVolume(muted ? 0 : volume)
  }, [volume, muted])
  useEffect(() => {
    const pauseHidden = () => {
      if (document.hidden && player.current && playback.playing)
        void player.current
          .toggle()
          .catch((error) => setError(messageFor(error)))
    }
    document.addEventListener("visibilitychange", pauseHidden)
    return () => document.removeEventListener("visibilitychange", pauseHidden)
  }, [playback.playing])

  async function load(event: FormEvent) {
    event.preventDefault()
    let source: string
    try {
      source = validateMediaUrl(url)
    } catch (error) {
      setError(messageFor(error))
      return
    }
    const id = ++request.current
    player.current?.dispose()
    setError("")
    setInfo(null)
    setFilename("")
    setLoading(true)
    setSwitching(false)
    setSeekValue(null)
    seekRef.current = null
    setPlayback({ time: 0, playing: false, buffering: false })
    const context = canvas.current?.getContext("2d")
    context?.clearRect(0, 0, canvas.current!.width, canvas.current!.height)
    let instance: MkvPlayer | undefined
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      instance?.dispose()
      if (id === request.current) {
        setLoading(false)
        setError(
          "The source took too long to respond. Check the link and try again."
        )
      }
    }, 30000)
    try {
      instance = new MkvPlayer(
        canvas.current!,
        (state) => {
          if (id === request.current) setPlayback(state)
        },
        (error) => {
          if (id === request.current) {
            request.current++
            setError(messageFor(error))
            setLoading(false)
            setInfo(null)
            player.current?.dispose()
            player.current = null
          }
        }
      )
      player.current = instance
      instance.setVolume(muted ? 0 : volume)
      const result = await instance.open(source)
      if (id !== request.current || timedOut) return
      setInfo(result)
      let name = new URL(source).pathname.split("/").pop() || "Untitled video"
      try {
        name = decodeURIComponent(name)
      } catch {
        /* Keep a malformed encoded filename readable. */
      }
      setFilename(name)
    } catch (error) {
      if (id === request.current && !timedOut) {
        setError(messageFor(error))
        instance?.dispose()
        player.current = null
      }
    } finally {
      clearTimeout(timeout)
      if (id === request.current) setLoading(false)
    }
  }

  function cancel() {
    request.current++
    player.current?.dispose()
    player.current = null
    setLoading(false)
    setInfo(null)
    setError("")
    setPlayback({ time: 0, playing: false, buffering: false })
  }
  async function run(action: () => Promise<void> | undefined) {
    try {
      await action()
    } catch (error) {
      setError(messageFor(error))
    }
  }
  async function changeTrack(value: string | null) {
    if (!info || switching || value === null) return
    const selected = value === "none" ? null : Number(value)
    setSwitching(true)
    setError("")
    try {
      await player.current?.selectAudio(selected)
      setInfo((current) => (current ? { ...current, selected } : null))
    } catch (error) {
      setError(messageFor(error))
    } finally {
      setSwitching(false)
    }
  }
  function commitSeek() {
    if (seekRef.current !== null) {
      const time = seekRef.current
      seekRef.current = null
      setSeekValue(null)
      void run(() => player.current?.seek(time))
    }
  }
  const audioItems = [
    { value: "none", label: "Audio off" },
    ...(info?.tracks.map((track) => ({
      value: String(track.id),
      label: track.label,
    })) ?? []),
  ]
  const selectedTrack = info?.tracks.find((track) => track.id === info.selected)
  const busy = loading || switching || playback.buffering

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={load} noValidate>
        <FieldGroup>
          <Field data-invalid={!!error && !info}>
            <FieldLabel htmlFor="video-url">Video URL</FieldLabel>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Link2
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="video-url"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/your-video.mkv"
                  className="h-12 pl-12"
                  aria-describedby="url-help"
                  aria-invalid={!!error && !info}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={loading}
                />
              </div>
              {loading ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={cancel}
                  className="h-12"
                >
                  <X data-icon="inline-start" />
                  Cancel
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="h-12"
                  disabled={!url.trim() || switching}
                >
                  Play video
                  <ArrowRight data-icon="inline-end" />
                </Button>
              )}
            </div>
            <FieldDescription id="url-help">
              Paste a direct link to your video. The source must allow browser
              access (CORS).
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>
            {info ? "Playback notice" : "Unable to play video"}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section
        ref={playerSurface}
        className="overflow-hidden rounded-xl border bg-card"
        aria-label="Video player"
      >
        <div
          ref={screen}
          className="player-screen relative flex aspect-video min-h-48 w-full min-w-0 items-center justify-center bg-cinema"
        >
          <canvas
            ref={canvas}
            className="absolute inset-0 size-full object-contain"
            aria-label={filename ? `Video: ${filename}` : "Video display"}
          />
          {!info && (
            <Empty className="relative">
              <EmptyHeader>
                <EmptyMedia>
                  <div className="play-emblem">
                    <Play
                      className="size-8"
                      strokeWidth={1.3}
                      aria-hidden="true"
                    />
                  </div>
                </EmptyMedia>
                <EmptyTitle>
                  {loading ? "Opening your video" : "The screen is yours."}
                </EmptyTitle>
                <EmptyDescription>
                  {loading
                    ? "Reading video details and available audio tracks…"
                    : "Paste a video link above. Settle in. Press play."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {info && busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-cinema/60">
              <span
                role="status"
                className="rounded-lg bg-card px-4 py-2 text-sm"
              >
                {switching ? "Switching audio…" : "Buffering…"}
              </span>
            </div>
          )}
          {info && !playback.playing && !busy && (
            <Button
              className="absolute"
              size="lg"
              onClick={() => run(() => player.current?.toggle())}
            >
              <Play data-icon="inline-start" />
              {playback.time >= info.duration ? "Replay" : "Resume"}
            </Button>
          )}
          <div className="absolute top-4 left-4">
            <Badge variant="secondary">
              {info ? info.codec.toUpperCase() : "MKV PLAYER"}
            </Badge>
          </div>
          <div
            className="absolute top-4 right-4 rounded-md bg-card px-2 py-1 text-xs text-foreground"
            role="status"
            aria-live="polite"
          >
            {loading
              ? "Connecting"
              : info
                ? playback.buffering
                  ? "Buffering"
                  : playback.playing
                    ? "Playing"
                    : "Paused"
                : "Ready when you are"}
          </div>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="fullscreen-audio">
            <Select
              items={audioItems}
              value={info ? String(info.selected ?? "none") : null}
              onValueChange={changeTrack}
              disabled={!info || switching}
            >
              <SelectTrigger aria-label="Fullscreen audio track">
                <AudioLines />
                <SelectValue placeholder="Audio track" />
              </SelectTrigger>
              <SelectContent
                portalContainer={playerSurface}
                alignItemWithTrigger={false}
                side="top"
              >
                <SelectGroup>
                  <SelectItem value="none">Audio off</SelectItem>
                  {info?.tracks.map((track) => (
                    <SelectItem
                      key={track.id}
                      value={String(track.id)}
                      disabled={!track.supported}
                    >
                      {track.label} · {track.codec.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <input
            type="range"
            className="timeline w-full"
            aria-label="Seek video"
            aria-valuetext={formatTime(seekValue ?? playback.time)}
            min={0}
            max={info?.duration || 1}
            step={0.1}
            value={seekValue ?? playback.time}
            disabled={!info || switching}
            onChange={(event) => {
              const value = Number(event.target.value)
              seekRef.current = value
              setSeekValue(value)
            }}
            onPointerUp={commitSeek}
            onKeyUp={commitSeek}
            onBlur={commitSeek}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="icon"
                disabled={!info || switching}
                aria-label={playback.playing ? "Pause" : "Play"}
                onClick={() => run(() => player.current?.toggle())}
              >
                {playback.playing ? <Pause /> : <Play />}
              </Button>
              <div className="hidden items-center gap-2 sm:flex">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!info || switching}
                  aria-label="Back 10 seconds"
                  onClick={() =>
                    run(() => player.current?.seek(playback.time - 10))
                  }
                >
                  <RotateCcw />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!info || switching}
                  aria-label="Forward 10 seconds"
                  onClick={() =>
                    run(() => player.current?.seek(playback.time + 10))
                  }
                >
                  <RotateCw />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                <span className="text-foreground">
                  {formatTime(seekValue ?? playback.time)}
                </span>
                <span className="mx-2">/</span>
                {formatTime(info?.duration ?? 0)}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="icon"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={() => setMuted(!muted)}
              >
                {muted || !volume ? <VolumeX /> : <Volume2 />}
              </Button>
              <input
                className="timeline hidden w-20 sm:block"
                type="range"
                aria-label="Volume"
                min="0"
                max="1"
                step="0.01"
                value={muted ? 0 : volume}
                onChange={(event) => {
                  setVolume(Number(event.target.value))
                  setMuted(false)
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={!info}
                aria-label="Enter fullscreen"
                onClick={() =>
                  run(async () => {
                    if (document.fullscreenElement)
                      await document.exitFullscreen()
                    else if (screen.current?.parentElement?.requestFullscreen)
                      await screen.current.parentElement.requestFullscreen()
                    else
                      throw new Error(
                        "Fullscreen is not supported in this browser."
                      )
                  })
                }
              >
                <Maximize />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <section className="min-w-0" aria-labelledby="now-playing">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <Film className="size-4" aria-hidden="true" />
            <h2 id="now-playing" className="text-sm font-medium">
              {info ? "Now playing" : "Your next watch"}
            </h2>
          </div>
          <p className="truncate text-lg font-medium" title={filename}>
            {info ? filename : "A link is all you need."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {info
              ? `${info.width} × ${info.height} · ${formatTime(info.duration)} · ${info.tracks.length} audio ${info.tracks.length === 1 ? "track" : "tracks"}`
              : "Your video plays here, with every available language in reach."}
          </p>
          {info &&
            info.tracks.length > 0 &&
            !info.tracks.some((track) => track.supported) && (
              <p className="mt-3 text-sm text-destructive">
                None of this file’s audio codecs can be decoded in your browser.
                Video will play without sound.
              </p>
            )}
        </section>
        <section
          className="flex flex-col gap-3"
          aria-labelledby="audio-heading"
        >
          <div className="flex items-center justify-between gap-4">
            <h2
              id="audio-heading"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <AudioLines className="size-4 text-primary" aria-hidden="true" />
              Audio track
            </h2>
            {info && (
              <span className="text-xs text-muted-foreground">
                {info.tracks.length} available
              </span>
            )}
          </div>
          <Select
            items={audioItems}
            value={info ? String(info.selected ?? "none") : null}
            onValueChange={changeTrack}
            disabled={!info || switching}
          >
            <SelectTrigger
              className="h-12 w-full"
              aria-labelledby="audio-heading"
            >
              <SelectValue placeholder="Available after opening a video" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value="none">Audio off</SelectItem>
                {info?.tracks.map((track) => (
                  <SelectItem
                    key={track.id}
                    value={String(track.id)}
                    disabled={!track.supported}
                  >
                    {track.label} · {track.codec.toUpperCase()}
                    {!track.supported ? " (unsupported)" : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {selectedTrack
              ? `${selectedTrack.codec.toUpperCase()} audio · Switch languages without losing your place.`
              : "English, Portuguese, or whatever your file includes."}
          </p>
        </section>
      </div>
      <footer className="flex flex-col items-start justify-between gap-4 pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <p className="flex items-center gap-2">
          <Check className="size-4" aria-hidden="true" />
          Played on your device. Never uploaded to this app.
        </p>
        <button
          type="button"
          className="help-link"
          aria-expanded={showHelp}
          aria-controls="playback-help"
          onClick={() => setShowHelp(!showHelp)}
        >
          Playback requirements {showHelp ? "−" : "+"}
        </button>
      </footer>
      {showHelp && (
        <aside
          id="playback-help"
          className="rounded-xl border bg-card p-6 text-sm text-muted-foreground"
        >
          <h2 className="mb-3 font-medium text-foreground">
            A few things your video needs
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-4">
            <li>
              A direct HTTP or HTTPS file URL, rather than a webpage or a
              streaming service link.
            </li>
            <li>
              A host that permits CORS. Byte range requests make starting and
              seeking much faster.
            </li>
            <li>
              A browser with WebCodecs and support for the video codec. H.264 is
              a good starting point; HEVC support varies by device.
            </li>
            <li>
              Audio support includes browser codecs plus AC-3, E-AC-3, and DTS
              decoders. Unsupported tracks are marked in the menu.
            </li>
          </ul>
          <p className="mt-4">
            Playback pauses when you leave this tab. Subtitles, DRM, and
            authenticated sources are not supported.
          </p>
        </aside>
      )}
    </div>
  )
}
