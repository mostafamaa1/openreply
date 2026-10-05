---
name: OpenReply dashboard
description: The signed-in workspace. A creator's Instagram account told as a live match.
colors:
  score-navy: "#0a1a33"
  broadcast-yellow: "#ffd60a"
  broadcast-yellow-hover: "#f5c800"
  yellow-ink: "#7a5c00"
  cool-paper: "#eef2f8"
  plate-white: "#ffffff"
  plate-hover: "#f3f6fb"
  plate-sunk: "#e3e9f2"
  hairline: "#d5dde9"
  hairline-strong: "#b9c5d6"
  slate-text: "#52627a"
  rival-steel: "#5878a3"
  gain-teal: "#00866f"
  loss-red: "#d6303a"
  bar-gain: "#2dd4b4"
  bar-loss: "#ff7a80"
  night-ground: "#060f1f"
  night-plate: "#0c1a30"
  night-hairline: "#1b2e4b"
  night-text: "#e8eef7"
  night-slate: "#8fa3c0"
typography:
  scoreline:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.025em"
  title:
    fontFamily: "Barlow Condensed, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.025em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  chip: "4px"
  control: "6px"
  plate: "8px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.broadcast-yellow}"
    textColor: "{colors.score-navy}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.broadcast-yellow-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.slate-text}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  segmented-active:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.score-navy}"
    rounded: "{rounded.chip}"
    height: "32px"
  range-preset-active:
    backgroundColor: "{colors.broadcast-yellow}"
    textColor: "{colors.score-navy}"
    rounded: "{rounded.chip}"
    height: "32px"
  plate:
    backgroundColor: "{colors.plate-white}"
    rounded: "{rounded.plate}"
    padding: "20px"
  score-bar:
    backgroundColor: "{colors.score-navy}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.plate}"
---

# Design System: OpenReply dashboard

<!-- Scope: everything under app/(dashboard), rendered inside the `.app` wrapper.
     The public site (landing, SEO pages, legal) keeps its own plain white and
     orange tokens on :root and is not covered here. -->

## Overview

**Creative North Star: "Matchday Broadcast"**

The dashboard is a creator's account presented as a live match. Every headline number is a scoreline with its change against the previous period, the way a broadcast score bug shows the score and the minute together. Competitors are a league table, the agents file a match report, and the latest DMs run along a lower-third ticker. The world refuses the category default of identical grey stat cards: one heavy navy bar carries the score, and everything else sits on quiet plates beneath it.

It is an operating surface, used daily on a laptop and late at night on a phone, so the broadcast grammar stays calm: navy, white and one yellow, with condensed lettering only where a number or a title needs to be read at a glance. Light and dark are both first-class; the theme follows the system unless the viewer picks one.

**Key Characteristics:**
- A navy score bar of condensed scorelines heads every analytics page.
- Broadcast yellow appears only for what is live, selected or primary.
- Every metric carries its change (arrow, sign and colour, never colour alone).
- Plates (white or deep navy) carry the detail; nothing is nested in a card inside a card.
- One authored motion: a scoreline rolls in from below when its value changes.

## Colors

Restrained: two neutrals and a navy, one saturated yellow, and a teal/red pair that means up or down and nothing else.

### Primary
- **Score Navy** (score-navy): the score bar, the sidebar rail, the phone tab bar, and the chart line in light mode. The one heavy element on screen.
- **Broadcast Yellow** (broadcast-yellow): primary buttons, the selected range preset, the active nav icon, the "you" row in the league table, the chart fill, and the ticker's label tab. Always carries navy text.
- **Yellow Ink** (yellow-ink): yellow as text on light grounds (links, "All posts"), because the fill yellow fails contrast there. In dark mode it is the fill yellow itself.

### Secondary
- **Rival Steel** (rival-steel): the previous period (dashed chart line), the "sent" stage of a funnel, and competitors. Never used for the creator's own current numbers.

### Tertiary
- **Gain Teal** (gain-teal) and **Loss Red** (loss-red): deltas, statuses and success/failure on plates. On the navy bar, **Bar Gain** (bar-gain) and **Bar Loss** (bar-loss) replace them, in both themes, for contrast.

### Neutral
- **Cool Paper** (cool-paper): the page ground in light mode. Cool, never cream.
- **Plate White** (plate-white), **Plate Hover** (plate-hover), **Plate Sunk** (plate-sunk): plates, row hover, and recessed tracks (segmented controls, progress tracks, skeletons).
- **Hairline** (hairline) and **Hairline Strong** (hairline-strong): borders and dividers; the strong one on hover.
- **Slate Text** (slate-text): secondary text, axis labels, hints.
- Dark mode swaps in **Night Ground** (night-ground), **Night Plate** (night-plate), **Night Hairline** (night-hairline), **Night Text** (night-text) and **Night Slate** (night-slate); the score bar deepens to `#020814`.

### Named Rules
**The Yellow Means Now Rule.** Broadcast yellow marks what is live, selected or the primary action. If it is decorating something at rest, it is wrong.

**The Arrow Rule.** A change is shown as arrow, sign and colour together. Colour alone never carries up or down.

**The Two Yellows Rule.** Yellow fills take navy text. Yellow as text is yellow-ink on light grounds.

## Typography

**Display Font:** Barlow Condensed (with system-ui)
**Body Font:** Barlow (with system-ui)

**Character:** The lettering of a score bug: a condensed, upright grotesk for numbers and titles, its regular-width sibling for everything you read or click. All figures are tabular so columns and scorelines line up.

### Hierarchy
- **Scoreline** (700, 2.5rem, 1): numbers in the score bar only.
- **Headline** (700, 1.5rem, uppercase, 0.025em): the page title in the top bar.
- **Title** (700, 1.125rem, uppercase, 0.025em): plate headings, agent names, ranked numbers in tables and lists (1.25–1.875rem for a featured total).
- **Body** (400–600, 0.875rem, 1.45): everything else, including table cells and controls.
- **Label** (600, 0.6875rem, uppercase, 0.12em): scoreline labels, table headers, sidebar group names.

### Named Rules
**The Condensed Is For Reading At A Glance Rule.** Barlow Condensed is for numbers and titles. Buttons, inputs, table cells and prose stay in Barlow.

## Layout

A fixed navy rail (256px) on desktop; on phones it becomes a drawer, and the four most used pages (Dashboard, Analytics, Agents, Campaigns) plus More sit in a navy tab bar at the bottom. Content is capped at 1400px with 16px gutters on phones and 32px on desktop, in a 20px rhythm between plates.

Analytics pages read top to bottom: score bar, then the trend, then two- or three-column rows of plates (`xl` breakpoint), then the detailed table. Grid children may never widen the page: wide charts and tables scroll inside their plate. On phones the score bar becomes a sideways snap strip, the range picker moves under the title, and tables turn into compact cards.

## Elevation & Depth

Depth is layered, not dramatic. Plates sit on the ground with a soft, offset shadow; the navy score bar casts the deepest one, which keeps it the heaviest element.

### Shadow Vocabulary
- **Plate rest** (`0 1px 2px rgb(10 26 51 / 0.05), 0 6px 20px -12px rgb(10 26 51 / 0.18)`): every plate in light mode.
- **Plate night** (`0 1px 0 rgb(255 255 255 / 0.03) inset, 0 8px 24px -16px rgb(0 0 0 / 0.6)`): plates in dark mode.
- **Score bar** (`0 10px 30px -18px rgb(10 26 51 / 0.7)`): the score bar.

### Named Rules
**The One Heavy Thing Rule.** Only the score bar is heavy. Plates stay light; nothing else gets a stronger shadow.

## Shapes

Gently squared: 8px plates, 6px controls, 4px chips and segment buttons, full pills for status chips and progress tracks. Borders are 1px hairlines.

## Components

### Buttons
- **Shape:** 6px corners, 36px tall.
- **Primary:** broadcast yellow with navy semibold text (Run now, New Campaign, Apply).
- **Hover / Focus:** a slightly deeper yellow; focus is a 2px yellow outline offset 2px.
- **Secondary:** hairline border, slate text that turns to foreground on hover (Refresh, Columns, CSV, Import).

### Segmented controls and the range picker
- **Style:** a recessed track (plate-sunk) holding equal buttons; the active one lifts to a plate with a hairline shadow.
- **Range picker:** the same track in the top bar, but the active preset fills yellow, because it is the one global choice on screen. Custom opens an inline two-date form.

### Status chips
- **Style:** tinted pill (12% of the status colour) with a dot and a word: Sent, Failed, Pending, Already DMed, Rate limited.

### Plates
- **Corner Style:** 8px.
- **Background:** plate white / night plate.
- **Shadow Strategy:** plate rest / plate night.
- **Internal Padding:** 16px on phones, 20px from `sm`.
- **Header:** a condensed uppercase title with an optional slate icon, one line of description, actions on the right.

### Navigation
- **Rail:** navy, grouped (Performance, Automation, Workspace), lucide icons at 18px. The active item gets a faint white wash and a yellow icon.
- **Phone tab bar:** navy, five equal tabs; the active one is yellow with a short yellow line along its top edge.

### Score Bar (signature)
The navy strip of scorelines: a small heading with a yellow bug tab, then up to six cells of label, condensed number and delta. Cells link to the page that explains them. When a value changes it rolls in from below (520ms, expo-out, slight blur).

### Data Table (signature)
Sortable headers with arrow icons, a search box, filter slots, a column picker, CSV export and pagination. Missing values sort to the bottom both ways. On phones each row becomes a card with the primary cell and up to four figures.

### Ticker
A lower-third strip: a yellow "Latest" tab and the newest DM events scrolling right to left, paused under the pointer or keyboard focus. With reduced motion it is a strip you scroll yourself.

## Do's and Don'ts

### Do:
- **Do** put a delta next to every period metric, against the previous period of the same length.
- **Do** use rival steel for anything that is not the creator's current number (previous period, competitors, the "sent" stage).
- **Do** show skeleton plates while loading and keep the previous numbers on screen while a new range loads.
- **Do** read chart colours from the theme tokens so both themes stay correct.

### Don't:
- **Don't** put white text on broadcast yellow.
- **Don't** use yellow as body or link text on light grounds; use yellow ink.
- **Don't** add a coloured side stripe to cards, list items or nav items.
- **Don't** add page-load choreography; the scoreline roll is the only authored motion.
- **Don't** use light-mode gain and loss colours on the navy bar.
