import {
  Input,
  UrlSource,
  ALL_FORMATS,
  CanvasSink,
  AudioBufferSink,
  type InputAudioTrack,
  type WrappedCanvas,
  type WrappedAudioBuffer,
} from "mediabunny"

export type AudioTrack = {
  id: number
  label: string
  codec: string
  supported: boolean
}
export type MediaInfo = {
  duration: number
  width: number
  height: number
  codec: string
  tracks: AudioTrack[]
  selected: number | null
}
export type PlaybackState = {
  time: number
  playing: boolean
  buffering: boolean
}
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 20))
let extensions: Promise<void> | undefined

export function validateMediaUrl(value: string) {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error("Enter a complete video URL, starting with https://.")
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use an HTTP or HTTPS video URL without embedded credentials."
    )
  if (
    typeof location !== "undefined" &&
    location.protocol === "https:" &&
    url.protocol === "http:"
  )
    throw new Error("This page uses HTTPS. Your video URL must also use HTTPS.")
  return url.href
}

function trackLabel(language: string, name: string | null, index: number) {
  const names: Record<string, string> = {
    eng: "English",
    por: "Português",
    spa: "Español",
    fra: "Français",
    fre: "Français",
    deu: "Deutsch",
    ger: "Deutsch",
    jpn: "日本語",
    ita: "Italiano",
  }
  let label: string | undefined = names[language]
  if (!label && language !== "und") {
    try {
      label = new Intl.DisplayNames(["en"], { type: "language" }).of(language)
    } catch {
      label = language
    }
  }
  return [label, name].filter(Boolean).join(" · ") || `Audio track ${index + 1}`
}

/** A bounded, progressive decoder. AudioContext is the shared audio/video clock. */
export class MkvPlayer {
  private input?: Input
  private video?: CanvasSink
  private tracks: InputAudioTrack[] = []
  private audio?: AudioBufferSink
  private context: AudioContext
  private gain: GainNode
  private sources = new Set<AudioBufferSourceNode>()
  private videoQueue: WrappedCanvas[] = []
  private audioQueue: WrappedAudioBuffer[] = []
  private videoDone = false
  private audioDone = false
  private lastFrameEnd = 0
  private audioThrough = 0
  private generation = 0
  private disposed = false
  private position = 0
  private anchor = 0
  private playing = false
  private buffering = false
  private frame = 0
  private lastUpdate = 0
  private duration = 0
  private videoIterator?: AsyncGenerator<WrappedCanvas, void, unknown>
  private audioIterator?: AsyncGenerator<WrappedAudioBuffer, void, unknown>

  constructor(
    private canvas: HTMLCanvasElement,
    private onState: (state: PlaybackState) => void,
    private onError: (error: Error) => void
  ) {
    this.context = new AudioContext()
    this.gain = this.context.createGain()
    this.gain.connect(this.context.destination)
    // Constructed directly in the user's submit gesture to unlock browser audio.
    void this.context.resume().catch(() => {})
  }

  async open(url: string): Promise<MediaInfo> {
    if (!("VideoDecoder" in window))
      throw new Error(
        "This browser does not support WebCodecs. Open the player in a current Chrome, Edge, or Safari browser."
      )
    extensions ??= Promise.all([
      import("@mediabunny/ac3"),
      import("@mediabunny/dts"),
    ]).then(([ac3, dts]) => {
      ac3.registerAc3Decoder()
      dts.registerDtsDecoder()
    })
    await extensions
    if (this.disposed) throw new Error("Playback cancelled.")
    this.input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(url, {
        maxCacheSize: 32 * 1024 * 1024,
        getRetryDelay: (attempt) => (attempt < 2 ? 0.5 : null),
        requestInit: { credentials: "omit", referrerPolicy: "no-referrer" },
        handleUnhandledError: (error) => this.fail(error),
      }),
    })
    const video = await this.input.getPrimaryVideoTrack()
    if (!video) throw new Error("No video track was found in this file.")
    const codec = await video.getCodec()
    if (!(await video.canDecode()))
      throw new Error(
        `Your browser cannot decode this video's ${codec ?? "unknown"} codec. Try a browser or device that supports it, or use an H.264 MKV.`
      )
    this.duration =
      (await this.input.getDurationFromMetadata()) ??
      (await video.computeDuration())
    if (!Number.isFinite(this.duration) || this.duration <= 0)
      throw new Error(
        "This file has no playable duration. Use a complete video file."
      )
    this.canvas.width = await video.getDisplayWidth()
    this.canvas.height = await video.getDisplayHeight()
    this.video = new CanvasSink(video, { poolSize: 8 })
    this.tracks = await this.input.getAudioTracks()
    const tracks = await Promise.all(
      this.tracks.map(async (track, index) => ({
        id: track.id,
        label: trackLabel(
          await track.getLanguageCode(),
          await track.getName(),
          index
        ),
        codec: (await track.getCodec()) ?? "unknown",
        supported: await track.canDecode(),
      }))
    )
    const selected = tracks.find((track) => track.supported)?.id ?? null
    this.audio =
      selected === null
        ? undefined
        : new AudioBufferSink(
            this.tracks.find((track) => track.id === selected)!
          )
    if (this.disposed) throw new Error("Playback cancelled.")
    await this.restart(0, true)
    return {
      duration: this.duration,
      width: this.canvas.width,
      height: this.canvas.height,
      codec: codec ?? "unknown",
      tracks,
      selected,
    }
  }

  get currentTime() {
    return Math.min(
      this.duration,
      this.playing && !this.buffering
        ? this.position + this.context.currentTime - this.anchor
        : this.position
    )
  }
  setVolume(volume: number) {
    this.gain.gain.value = volume
  }
  async toggle() {
    if (this.playing) {
      this.position = this.currentTime
      this.playing = false
      await this.context.suspend()
      this.emit()
    } else if (this.position >= this.duration - 0.05) {
      await this.restart(0, true)
    } else {
      this.anchor = this.context.currentTime
      this.playing = true
      // Resume in this user gesture; tick will suspend again if buffering.
      await this.context.resume()
      this.emit()
    }
  }
  async seek(time: number) {
    await this.restart(Math.max(0, Math.min(time, this.duration)), this.playing)
  }
  async selectAudio(id: number | null) {
    const track = this.tracks.find((track) => track.id === id)
    if (id !== null && (!track || !(await track.canDecode())))
      throw new Error("This audio track cannot be decoded in your browser.")
    const time = this.currentTime
    this.audio = track ? new AudioBufferSink(track) : undefined
    await this.restart(time, this.playing)
  }

  private async restart(time: number, play: boolean) {
    const generation = ++this.generation
    cancelAnimationFrame(this.frame)
    this.playing = false
    this.position = time
    this.stopSources()
    void this.videoIterator?.return().catch(() => {})
    void this.audioIterator?.return().catch(() => {})
    await this.context.suspend()
    if (generation !== this.generation || this.disposed) return
    this.anchor = this.context.currentTime
    this.playing = play
    this.buffering = true
    this.videoQueue = []
    this.audioQueue = []
    this.videoDone = false
    this.audioDone = !this.audio
    this.lastFrameEnd = time
    this.audioThrough = time
    this.emit()
    this.videoIterator = this.video!.canvases(time)
    this.audioIterator = this.audio?.buffers(time)
    void this.fillVideo(this.videoIterator, generation)
    if (this.audioIterator) void this.fillAudio(this.audioIterator, generation)
    void this.tick(generation)
  }

  private async fillVideo(
    iterator: AsyncGenerator<WrappedCanvas, void, unknown>,
    generation: number
  ) {
    try {
      while (generation === this.generation && !this.disposed) {
        if (this.videoQueue.length >= 5) {
          await wait()
          continue
        }
        const result = await iterator.next()
        if (generation !== this.generation || this.disposed) break
        if (result.done) {
          this.videoDone = true
          break
        }
        this.videoQueue.push(result.value)
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error)
    } finally {
      await iterator.return().catch(() => {})
    }
  }
  private async fillAudio(
    iterator: AsyncGenerator<WrappedAudioBuffer, void, unknown>,
    generation: number
  ) {
    try {
      while (generation === this.generation && !this.disposed) {
        if (this.audioQueue.length >= 48) {
          await wait()
          continue
        }
        const result = await iterator.next()
        if (generation !== this.generation || this.disposed) break
        if (result.done) {
          this.audioDone = true
          break
        }
        this.audioQueue.push(result.value)
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error)
    } finally {
      await iterator.return().catch(() => {})
    }
  }

  private async tick(generation: number) {
    if (generation !== this.generation || this.disposed) return
    try {
      const time = this.currentTime
      // An exhausted iterator or a future queued sample can also signify an intentional gap.
      const videoReady =
        this.videoDone ||
        this.videoQueue.length > 0 ||
        this.lastFrameEnd > time + 0.015
      const audioReady =
        this.audioDone ||
        this.audioQueue.length > 0 ||
        this.audioThrough > time + 0.08
      const buffering = !(videoReady && audioReady)
      if (buffering !== this.buffering) {
        this.position = time
        this.buffering = buffering
        if (buffering) await this.context.suspend()
        this.anchor = this.context.currentTime
      }
      if (generation !== this.generation || this.disposed) return
      if (this.playing && !this.buffering && this.context.state === "suspended")
        await this.context.resume()
      if ((this.buffering || !this.playing) && this.context.state === "running")
        await this.context.suspend()
      if (generation !== this.generation || this.disposed) return
      while (
        this.videoQueue.length &&
        this.videoQueue[0].timestamp <= time + 0.015
      ) {
        const sample = this.videoQueue.shift()!
        this.canvas.getContext("2d")!.drawImage(sample.canvas, 0, 0)
        this.lastFrameEnd = sample.timestamp + sample.duration
      }
      while (
        this.audioQueue.length &&
        this.audioQueue[0].timestamp < time + 0.3
      ) {
        const sample = this.audioQueue.shift()!
        const offset = Math.max(0, time - sample.timestamp)
        if (offset >= sample.buffer.duration) continue
        const source = this.context.createBufferSource()
        source.buffer = sample.buffer
        source.connect(this.gain)
        source.onended = () => {
          this.sources.delete(source)
          source.disconnect()
        }
        this.sources.add(source)
        source.start(
          this.context.currentTime + Math.max(0, sample.timestamp - time),
          offset
        )
        this.audioThrough = sample.timestamp + sample.buffer.duration
      }
      if (time >= this.duration) {
        this.position = this.duration
        this.playing = false
        this.buffering = false
        this.stopSources()
        await this.context.suspend()
      }
      if (performance.now() - this.lastUpdate > 100) {
        this.emit()
        this.lastUpdate = performance.now()
      }
      this.frame = requestAnimationFrame(() => {
        void this.tick(generation)
      })
    } catch (error) {
      if (generation === this.generation) this.fail(error)
    }
  }
  private emit() {
    if (!this.disposed)
      this.onState({
        time: this.currentTime,
        playing: this.playing,
        buffering: this.buffering,
      })
  }
  private stopSources() {
    for (const source of this.sources) {
      source.stop()
      source.disconnect()
    }
    this.sources.clear()
  }
  private fail(error: unknown) {
    if (this.disposed) return
    this.position = this.currentTime
    this.playing = false
    this.buffering = false
    ++this.generation
    cancelAnimationFrame(this.frame)
    this.stopSources()
    void this.context.suspend().catch(() => {})
    this.emit()
    this.onError(error instanceof Error ? error : new Error(String(error)))
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    ++this.generation
    cancelAnimationFrame(this.frame)
    this.stopSources()
    void this.videoIterator?.return().catch(() => {})
    void this.audioIterator?.return().catch(() => {})
    this.input?.dispose()
    void this.context.close().catch(() => {})
  }
}
