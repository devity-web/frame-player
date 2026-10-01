---
name: Frame
description: A quiet, dark viewing room for video from a link.
colors:
  background: "#181818"
  foreground: "#f2f2ec"
  card: "#1f1f1f"
  cinema: "#000000"
  primary: "#c5d6a4"
  primary-foreground: "#182112"
  muted: "#272727"
  muted-foreground: "#a8a8a1"
  secondary: "#313131"
  border: "#383833"
  input: "#41413a"
  destructive: "#f4a09a"
typography:
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "16px"
  headline:
    fontFamily: "Geist, sans-serif"
    fontWeight: 500
rounded:
  lg: "10px"
  xl: "14px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    height: "48px"
---

## Overview

Frame uses a dark cinema surface with a muted moss accent. The black video screen dominates; surrounding copy and controls are quiet and compact. This document records the implementation in `app/globals.css`, `app/page.tsx`, and `components/player/video-player.tsx`.

## Colors

Moss marks the primary action, brand punctuation, play emblem, sliders, and keyboard focus. Warm white carries primary text; muted gray carries descriptions and metadata. Charcoal surfaces and subtle borders separate controls from the black screen. Soft red is reserved for playback errors.

## Typography

Geist is the interface typeface. The headline is medium weight with tight tracking, increasing from 30px to 36px on wider screens. Body copy is 16px, supporting labels are 14px, and metadata is 12px. Playback timestamps use tabular numerals. Long filenames truncate, with the complete name available in the title attribute.

## Layout

The centered page has a maximum width of 1152px and horizontal padding of 16px on mobile and 32px from the small breakpoint. Major sections have 32px gaps. A compact brand header precedes the heading and URL form.

The URL input sits above the screen, with the action alongside it on wider screens and below it on mobile. The screen uses a 16:9 aspect ratio and a 192px minimum height. The timeline and playback toolbar sit inside the same bordered surface. Fullscreen is at the toolbar's right edge.

Below the player, video details and a 320px audio column share a row from the medium breakpoint; they stack on mobile. Mobile hides ten-second skip buttons and the volume slider while retaining play, mute, seeking, and fullscreen. Fullscreen reveals an audio selector inside the player.

## Elevation & Depth

Depth comes from tonal surfaces and thin borders. The screen is flat black. Buffering uses a translucent black overlay; menus use the darker popover surface.

## Shapes

Controls use modest rounded corners. The player and requirements panel use the larger corner radius. The outlined circular play emblem is the main rounded visual accent, distinct from the rectangular viewing area.

## Components

The interface uses shadcn buttons, input, fields, alerts, empty states, badges, and selects with Lucide icons. The URL field and primary action are 48px tall. The unloaded screen pairs the outlined play emblem with short guidance and readiness status. Loading offers cancellation; buffering and audio switching show explicit status text. Unavailable playback controls and unsupported audio tracks are disabled.

Audio selection appears below and to the right of the player, showing language and codec information after loading. Playback requirements expand from a footer control. Focus indicators, accessible control names, a skip link, and live status text support keyboard and assistive technology use.

Buttons transition over 240ms and compress slightly on press. The main content enters with a subtle 800ms fade and vertical movement only when reduced motion is not requested.

## Do's and Don'ts

- Keep the video screen visually dominant and source entry immediately above it.
- Use moss sparingly for actions, focus, and playback accents.
- Preserve audio access in both the page layout and fullscreen.
- Keep metadata subordinate and errors actionable.
- Avoid decorative imagery or additional competing accent colors around the video.
