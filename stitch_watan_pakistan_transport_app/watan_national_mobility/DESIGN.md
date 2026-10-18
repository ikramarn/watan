---
name: Watan National Mobility
colors:
  surface: '#f8faf5'
  surface-dim: '#d9dbd6'
  surface-bright: '#f8faf5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4ef'
  surface-container: '#edeeea'
  surface-container-high: '#e7e9e4'
  surface-container-highest: '#e1e3de'
  on-surface: '#191c1a'
  on-surface-variant: '#3f4940'
  inverse-surface: '#2e312e'
  inverse-on-surface: '#f0f1ec'
  outline: '#6f7a70'
  outline-variant: '#bec9be'
  surface-tint: '#0b6d3b'
  primary: '#004d27'
  on-primary: '#ffffff'
  primary-container: '#006837'
  on-primary-container: '#8ee4a6'
  inverse-primary: '#83d99c'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65b'
  on-secondary-container: '#745c00'
  tertiary: '#39453e'
  on-tertiary: '#ffffff'
  tertiary-container: '#505d55'
  on-tertiary-container: '#c7d5cb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9ef6b6'
  primary-fixed-dim: '#83d99c'
  on-primary-fixed: '#00210e'
  on-primary-fixed-variant: '#00522a'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#d8e6dc'
  tertiary-fixed-dim: '#bccac0'
  on-tertiary-fixed: '#121e18'
  on-tertiary-fixed-variant: '#3d4a43'
  background: '#f8faf5'
  on-background: '#191c1a'
  surface-variant: '#e1e3de'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Noto Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
The design system powers Pakistan's unified national transport super-app, orchestrating intercity rail, urban metros, ride-hailing, dynamic buses, and toll networks under a single civic infrastructure. The aesthetic reflects modern civic pride: dependable, authoritative, exceptionally clear, and technologically agile.

The visual ethos blends **Modern Tactile Materiality** with **Subtle Heritage Warmth**. Rather than mimicking generic Silicon Valley transit utilities or austere bureaucratic portals, the interface pairs deep emerald tones with warm brass precision, crisp white surfaces, and tactile, thumb-friendly geometry. Visual components feel physically reliable and distinct—like high-grade metallic tokens, secure banknotes, and precision transit maps. The experience guarantees effortless legibility under bright South Asian daylight, caters fluidly to bidirectional English/Urdu scripts, and provides unhurried reassurance during multi-modal journeys.

## Colors
The color foundation is grounded in the national identity while maintaining institutional trust and accessibility standards (WCAG AAA compliant for critical journeys):

- **Primary (`#006837` - Pakistan Emerald):** Anchors navigation headers, decisive action buttons, confirmed ticket statuses, and active route lines. Deep shade `#004D28` serves as pressed states and contrast headers.
- **Secondary (`#D4AF37` - Polished Brass / Warm Gold):** Used for priority services, fast-track rail classes (AC Executive), real-time delays, dynamic fares, and verification shields. Paired with `#F5A623` for attention-demanding active transit pulses.
- **Tertiary (`#E6F4EA` - Mint Wash):** Serves as soft active backdrops, route chip containers, selected segmented tabs, and low-cognitive-load card backgrounds.
- **Neutral (`#2B2E2B` - Deep Basalt Charcoal):** A rich, organic charcoal replacing harsh pure black. Preserves typographic warmth across high-density schedules and journey logs.
- **Surface Neutrals:** Background canvas relies on `#F7F9F7` (Ivory Alabaster) with pure `#FFFFFF` used strictly for elevated cards, modal sheets, and tickets.

## Typography
Typographic scale supports instant recognition in high-movement transit settings. `Plus Jakarta Sans` provides crisp geometric modernism with friendly, open counters for all station names, fares, balance displays, and route numbers. `Noto Sans` operates as the reliable workhorse for UI metadata, status labels, and multi-lingual transit notices.

When localization switches to Urdu, `Noto Nastaliq Urdu` or `Noto Sans Arabic` dynamically substitutes without altering the optical vertical baseline: line-height tokens for Urdu increase by a baseline multiplier of `1.25x` to accommodate descending ligatures cleanly. All numerical displays (seat numbers, platform indices, gate numbers, and departure times) use tabular figures (`tnum`) to eliminate spatial shifting during real-time GPS feeds.

## Layout & Spacing
A fluid 4-column layout governs mobile devices (<600px), transitioning to 8 columns on foldables and tablets (600px–1024px), and 12 columns for terminal dispatcher views. Margins are locked to `1rem` on mobile screens to maximize spatial efficiency for horizontal vehicle schedules and interactive maps.

A strict 4px base layout module underpins all padding and margins:
- `space-xs` (4px): Micro-spacing between icon and platform badge label.
- `space-sm` (8px): Gaps between transit mode chips and adjacent list meta indicators.
- `space-md` (16px): Internal padding inside cards, modular ticket tiles, and input sheets.
- `space-lg` (24px): Vertical spacing separating distinct trip sections (e.g., origin card to destination card).
- `space-xl` (32px): Boundary between primary trip tracker actions and secondary contextual tools.

## Elevation & Depth
Elevation conveys physical presence and transit priority via multi-layer ambient green-tinted shadows, avoiding flat visual confusion on bright screens:

- **Level 0 (Flat Ground):** `#F7F9F7` background with no shadow. Used for base map frames, structural divider lines, and disabled track state lines.
- **Level 1 (Card & Module Layer):** `0 2px 8px -2px rgba(0, 77, 40, 0.06), 0 1px 3px 0 rgba(0, 0, 0, 0.04)`. Used for transit route cards, station cards, and upcoming journey notifications.
- **Level 2 (Floating Controls & Bottom Sheets):** `0 12px 24px -6px rgba(0, 77, 40, 0.12), 0 4px 8px -2px rgba(0, 0, 0, 0.06)`. Applied to interactive vehicle filters, pull-up destination drawers, and bottom navigation bars.
- **Level 3 (Modal Tickets & QR Boarding Passes):** `0 20px 32px -8px rgba(0, 77, 40, 0.18), 0 8px 16px -4px rgba(0, 0, 0, 0.08)`. Reserved for digital boarding passes, NFC gate tokens, and modal confirmations.
- **Hairline Accent Borders:** Every elevated container employs a subtle `1px` translucent inner boundary (`rgba(0, 104, 55, 0.08)`) to preserve card definition in extreme sunlight or OLED dark mode adjustments.

## Shapes
The system utilizes a structured Level 2 (Rounded) corner geometry. Cards, modal containers, and sheet drawers employ `1rem` (16px) or `1.5rem` (24px) corner radii, delivering an organic, ergonomic hand feel in single-handed transit navigation.

Small interactive components such as chips, badges, and toggle pills leverage full pill-rounding (`9999px`) to visually signal tactile pressability. Boarding cards feature simulated circular ticket-punch notches along the horizontal divider seam with a cutout radius of `12px`.

## Components

### Action Buttons
- **Primary Action (Book / Confirm / Tap to Pay):** Solid Pakistan Emerald (`#006837`) background, text in crisp white (`#FFFFFF`), `16px` vertical height padding, `16px` border radius. Includes an inner haptic state cue with deep `#004D28` on press.
- **Secondary / Express Action:** Warm Gold surface (`#D4AF37`) with basalt charcoal typography (`#2B2E2B`) for priority line upgrades, express route unlocks, and wallet reload shortcuts.
- **Outlined Utility:** Border `1.5px` solid `#006837` with mint-wash tint (`#E6F4EA`) on tap.

### Transit Chips & Segmented Controls
- **Mode Chips (Metro, GreenLine BRT, Railway, Orange Line):** Pill-shaped (`rounded-full`) with a `32px` standard height. Inactive chips use a `#FFFFFF` fill with `1px` stroke in `#E1E6E1` and neutral text. Selected chips display `#E6F4EA` background, bold `#006837` text, and a `1.5px` emerald contour.
- **Live ETA Chip:** Solid `#2B2E2B` background with glowing `#F5A623` live pulsing dot indicator for arriving vehicles.

### Input Fields & Station Pickers
- **Origin / Destination Fields:** Large `56px` touch target with `#FFFFFF` background, paired with connected vertical pin-points (Green circle for origin, Brass square for destination). Focus states reveal a `2px` border in `#006837` with an ambient mint glow. Clear icons and voice inputs are right-aligned (left-aligned in Urdu RTL mode).

### Live Boarding & Journey Cards
- **Pass Structure:** White elevated card containing a perforated separator between transit details and the scannable dynamic QR gate key. 
- **Platform Badge:** High-contrast pill badge with bold, tabular track numbers (e.g., "PF 3 • Gate B").
- **Delay Warning Pill:** Warm Gold / Amber badge with clear differential time notation (`+8 min`).

### Lists & Transit Step Indicators
- **Journey Legs:** Connected step-line with `2px` stroke colored by transport type (Emerald for Rail, Amber for Express BRT, Charcoal for walking segments). Station stops feature hollow `8px` milestone dots that fill solid as the GPS vehicle progresses.