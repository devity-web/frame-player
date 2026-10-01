import Link from "next/link"
import { Play } from "lucide-react"
import { VideoPlayer } from "@/components/player/video-player"

// Server Component: only the interactive player crosses the client boundary.
export default function Page() {
  return (
    <div className="mx-auto flex min-h-svh max-w-6xl flex-col px-4 sm:px-8">
      <a href="#main" className="skip-link">
        Skip to player
      </a>
      <header className="flex items-center justify-between py-8">
        <Link
          href="/"
          aria-label="Frame home"
          className="flex items-center gap-3"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Play className="size-4" fill="currentColor" />
          </span>
          <span className="text-xl font-semibold tracking-tight">
            frame<span className="text-primary">.</span>
          </span>
        </Link>
        <span className="max-w-40 text-right text-xs text-muted-foreground sm:max-w-none">
          A little space for your next watch.
        </span>
      </header>
      <main
        id="main"
        className="flex flex-1 flex-col gap-8 pt-8 pb-12 sm:pt-12"
      >
        <div className="flex flex-col gap-3">
          <h1 className="max-w-2xl text-3xl font-medium tracking-tight sm:text-4xl">
            Your video. Your language.
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Play an MKV from a link. Make yourself comfortable.
          </p>
        </div>
        <VideoPlayer />
      </main>
    </div>
  )
}
