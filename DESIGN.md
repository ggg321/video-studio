---
version: alpha
name: Video Studio
description: Local platform for automating short talking-head videos. Calm dark workspace by default, light theme on request, one switchable accent.
colors:
  primary: "#c92b8a"
  background: "#0b0d12"
  surface: "#11141b"
  card: "#151921"
  raised: "#1c212c"
  line: "#232938"
  text: "#eceff6"
  muted: "#8b94a8"
  faint: "#5d6679"
  accent: "#ee7fc3"
  accent-strong: "#c92b8a"
  accent-text: "#f7b4de"
  accent-soft: "#2b1428"
  on-accent: "#ffffff"
  ok: "#4cc38a"
  ok-text: "#7fe0ad"
  ok-soft: "#12301f"
  warn: "#e3ac3d"
  warn-text: "#f0c76b"
  warn-soft: "#33280f"
  danger: "#f0626e"
  danger-text: "#ff9aa3"
  danger-soft: "#35171b"
  light-background: "#f5f6fa"
  light-card: "#ffffff"
  light-text: "#161a24"
  light-muted: "#5b6579"
  light-accent: "#c0268a"
  light-accent-text: "#9a1a6d"
typography:
  title:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 700
    letterSpacing: -0.02em
  heading:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 650
  body:
    fontFamily: Inter
    fontSize: 14.5px
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
rounded:
  sm: 10px
  md: 14px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 14px
  lg: 20px
  xl: 28px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
  text-muted:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted}"
  pill-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok-text}"
    rounded: "{rounded.full}"
  pill-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn-text}"
    rounded: "{rounded.full}"
  pill-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.full}"
  light-card:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.md}"
  light-muted:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-muted}"
  light-link:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.light-accent-text}"
---

## Overview

Video Studio is a working tool for a small team that makes several short videos a day. The interface stays out of the way: a dark, low-glare workspace by default, a light theme for bright rooms, and a single accent colour that marks the main action, the current step and links. The product has two modes. Simple is a board of creatives with one "Make all" button. Pro opens every setting in collapsible panels.

## Colors

Everything is defined as CSS variables in `public/ui.css`; this file is the readable summary of them.

- **Background, surface, card, raised:** four steps of near-black blue. A card sits one step above the page, a raised element one step above a card. Borders use `line`.
- **Text, muted, faint:** primary text, secondary text and hints. Muted must stay readable on a card, faint is only for placeholders and disabled things.
- **Primary (accent):** orchid by default. The user can switch it to cyan, amber, coral or violet in Settings, in the browser, per person. Never green: green is reserved for "done".
- **Status:** green means done, amber means waiting or attention, red means stopped or failed. Each has a soft background and a readable text colour for pills and notices.
- **Light theme:** the same roles with a pale background and white cards. Accents get stronger on white so links keep their contrast (orchid becomes `#c0268a`).

## Typography

Inter everywhere, with the system sans as fallback. Titles are bold with tight tracking, body text sits at 14.5px with generous line height. Videos use their own fonts (Montserrat for motion text) and do not follow this file.

## Layout

A sticky top bar with the main sections (Creatives or Projects, Sources, Motion), the Simple / Pro switch, notices, settings, theme and language. Pages are centred, up to about 1100px wide; the Pro editor goes to 1320px and keeps the preview pinned beside the controls on wide screens.

## Elevation and Shape

Cards are flat with a hairline border and a soft shadow. Corners are rounded (10px for controls, 14px for cards, fully round for pills). Nothing uses heavy gradients except the brand mark.

## Components

- **Primary button:** strong accent fill with white text. One per view.
- **Card:** a panel that holds one idea. In Pro, cards fold into panels with a one-line summary.
- **Pills:** small status labels in the three status colours.
- **Creative card (Simple mode):** large vertical video on the left, script and source on the right, a step line (voice, avatar, inserts, render) and quick tweak chips.

## Do's and Don'ts

- Do keep one accent on screen and use it only for the main action, the current step and links.
- Do show cost before any paid step starts.
- Do keep text at AA contrast in both themes.
- Don't use green for anything but done.
- Don't add a second primary button next to the first.
- Don't hide an error in a toast alone; keep it where the user is looking.
