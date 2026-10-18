---
name: Rugged Terminal Industrial
colors:
  surface: '#0d1513'
  surface-dim: '#0d1513'
  surface-bright: '#333b38'
  surface-container-lowest: '#08100e'
  surface-container-low: '#151d1b'
  surface-container: '#19211f'
  surface-container-high: '#232c29'
  surface-container-highest: '#2e3634'
  on-surface: '#dce4e1'
  on-surface-variant: '#bccabc'
  inverse-surface: '#dce4e1'
  inverse-on-surface: '#2a3230'
  outline: '#869487'
  outline-variant: '#3d4a3f'
  surface-tint: '#59df89'
  primary: '#59df89'
  on-primary: '#00391a'
  primary-container: '#00a859'
  on-primary-container: '#003317'
  inverse-primary: '#006d38'
  secondary: '#ffb95f'
  on-secondary: '#472a00'
  secondary-container: '#ee9800'
  on-secondary-container: '#5b3800'
  tertiary: '#93ccff'
  on-tertiary: '#003351'
  tertiary-container: '#3399dd'
  on-tertiary-container: '#002e49'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#77fca3'
  primary-fixed-dim: '#59df89'
  on-primary-fixed: '#00210d'
  on-primary-fixed-variant: '#005228'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#93ccff'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#004b73'
  background: '#0d1513'
  on-background: '#dce4e1'
  surface-variant: '#2e3634'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-numeric-lg:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.03em
  label-numeric-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
  urdu-display:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 26px
  urdu-sub:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered for industrial field-grade transport terminals, dispatch booths, and ruggedized POS tablets operating under harsh outdoor conditions—from midday desert sun to dust-choked night depots. 

The aesthetic is functional, tactical, and uncompromisingly utilitarian, merging **Industrial High-Contrast Dark Mode** with **Modern Tactile Ruggedness**. It eliminates decorative ambiguity in favor of clear operational status, instant tap-target legibility, and high-cadence data entry. 

Key attributes:
- **Resilient & Authoritative:** Built like heavy hardware machinery. Visual hierarchies favor structural boundaries, pronounced borders, and discrete mechanical panels over soft atmospheric blurs.
- **Immediate Legibility:** Outdoor glanceability is prioritized through deliberate tonal separation between deep carbon/slate backdrops and sharp luminous accents.
- **High-Throughput Tactility:** Actions feel click-ready and physical, with distinct pressed states engineered for grease, dust, or gloved hands.
- **Bilingual Functionalism:** Equal architectural weight for Nastaliq/Arabic-script Urdu glyphs and Latin characters, preventing vertical overlap or clipped ascenders/descenders in compressed data cells.

## Colors

The palette is tuned specifically for OLED and anti-glare capacitive touch displays, maximizing contrast ratios (exceeding WCAG AAA for key operational indicators) to combat extreme ambient light wash.

### Color Roles & Semantics
- **Neutral Base (`#0F1715` / `#16221F` / `#1F2E2B`):** Carbon-slate with an undertone of deep mineral green. Replaces lifeless neutral blacks with an industrial field identity while reducing eye strain during night shifts.
- **Primary Emerald (`#00A859` / `#008744`):** Represents system readiness, validated tickets, successful transactions, and primary actions (e.g., "Issue Ticket / ٹکٹ جاری کریں").
- **Secondary Amber/Gold (`#F59E0B` / `#D97706`):** Dedicated to active vehicle queues (*pari* dispatch lists), imminent departures, cautionary capacity thresholds, and hold states.
- **Tertiary Cyan (`#0284C7`):** Assigned to logistics routing, freight consignment tracking, and secondary hardware alerts.
- **High-Visibility Text & Surface Accents:**
  - `Text Primary`: `#F8FAFC` (Pure cold white for critical numbers, seat designations, and route names).
  - `Text Secondary`: `#94A3B8` (Slate grey for metadata, labels, and microcopy).
  - `Border / Dividers`: `#2D3F3B` (Structural grid dividers providing tactile separation between interactive POS modules).
  - `Critical Alarm / Error`: `#EF4444` (Voided tickets, emergency holds, and network drops).

## Typography

Typography is split into three deliberate working tiers:
1. **Space Grotesk (Structural & Display):** High-density geometric letterforms used for terminal headers, route destinations (e.g., "LAHORE - RAWALPINDI"), and vehicle registration identifiers. Its open counters retain shape integrity even on low-resolution outdoor touchscreens.
2. **Inter (Body & Bilingual Companion):** The functional engine for user interface mechanics, driver details, and secondary instructional copy. Inter pairs cleanly with Noto Sans for bilingual Urdu text pairings.
3. **JetBrains Mono (Data, Fares, & Timestamps):** Monospaced characters ensure fare currencies (e.g., `PKR 2,850`), departure clocks (`14:45:00`), and seat matrices (`SEAT 14A`) do not produce horizontal layout shifts as numbers rapidly increment.

### Bilingual Typesetting Rules
- In bilingual labels, Urdu text sits parallel or directly underneath English text at +2px font-size to counter the visual density differential of the Arabic script.
- Monospace figures maintain standard left-to-right reading direction regardless of RTL language toggles.

## Layout & Spacing

The terminal layout operates on a compact, information-dense 12-column CSS Grid configured specifically for horizontal POS terminals (typical screen sizes: 10.1" to 14" tablets at 1280x800 or 1920x1080 resolution), with seamless reflow for handheld handheld smart terminals (5.5" to 6.5").

### Touch-Target Standards
- Minimum touch target dimension for all interactive surfaces is **48x48px**, with critical high-frequency keys (e.g., "Add Seat", "Cash Tendered") scaled to **56px to 64px** vertical height.
- Component-internal padding adheres to a compact scale (`space-xs` to `space-md`) to ensure maximum visible data without forcing off-screen scroll bars during checkout.

### Form-Factor Adaptations
- **Tablet / Terminal POS (>= 1024px):** Fixed 3-pane layout:
  - Left Pane (3 cols): Route selection, departure queue (*Pari*), bus readiness status.
  - Center Pane (5 cols): Interactive physical bus seat layout and passenger manifests.
  - Right Pane (4 cols): Billing summary, Urdu/English ticket stub preview, and one-touch cash tender keys.
- **Handheld Terminal (< 1024px):** Stacked single-column card views with sticky bottom primary action bars for single-thumb dispatch and printing.

## Elevation & Depth

This system intentionally rejects atmospheric drop shadows, blurry glassmorphism, and ambient glows, which degrade into muddy artifacts under direct outdoor sunlight and tax low-spec terminal chipsets.

Depth is constructed entirely through **Tonal Stacking** and **Crisp Structural Outlines**:
- **Base Canvas (`#0F1715`):** The structural shell of the application.
- **Surface Level 1 (`#16221F`):** Station panels, data blocks, and inactive seat cells. Outlined by a solid `1px` border of `#233530`.
- **Surface Level 2 (`#1F2E2B`):** Hovered states, active modal sheets, and prioritized input rows. Outlined by `1px` border of `#364E48`.
- **Surface Level 3 - Active / Elevated (`#283D38`):** Dragged passenger rows, active keypad inputs, and system popovers. Outlined with `#00A859` for verified modules or `#F59E0B` for attention modules.
- **Hardware-Pressed Simulation:** Active buttons shift downward by `1px` with an interior solid highlight border (`inset 0 2px 0 rgba(255, 255, 255, 0.15)`), mimicking physical membrane keypad depression.

## Shapes

The design language uses tight, mechanical corner radiuses (`roundedness: 1`). 

- Default elements (buttons, inputs, cards) receive a **4px (`0.25rem`)** radius.
- Large operational panels and terminal view containers use **8px (`0.5rem`)**.
- Tags, status pills, and seat indicators utilize **4px (`0.25rem`)** to maximize horizontal and vertical text packing density without clipping terminal characters.

Circular pill buttons and extreme rounded corners are explicitly prohibited; they waste vital corner touch area and visually conflict with rugged hardware bezels.

## Components

### Buttons
- **Primary Action (Dispatch / Print Ticket):** Heavy solid `#00A859` background with `#0F1715` bold text. Minimum 52px height. Top inner highlight `1px solid rgba(255,255,255,0.2)` for a tactile raised look.
- **Secondary Action (Luggage Tag, Hold Seat):** Deep slate-green base (`#1F2E2B`) with a `1.5px` border in `#364E48` and crisp `#F8FAFC` text.
- **Warning/Pari Action:** High-intensity Amber (`#F59E0B`) background with `#0F1715` text for immediate attention (e.g., "Depart Bus Now / روانہ کریں").
- **Disabled State:** Translucent carbon `#16221F` background with `#475569` text and `#233530` border.

### Interactive Bus Seat Grid
- Seats are rendered as discrete squircle cells with dual indicators:
  - **Available:** `#16221F` background, `#2D3F3B` border, white mono seat number (`12A`).
  - **Selected / In Cart:** Flashing `#00A859` border with emerald-tinted fill (`#00A859` at 20% opacity).
  - **Occupied / Booked:** Subdued `#111817` fill with diagonal warning stripes (or low-contrast grey text `#64748B`).
  - **Female-Reserved:** Vivid purple/cyan accent border to instantly comply with localized public transit seating protocols.

### Queue & Status Chips (Pari System)
- Rectangular badge components featuring monospaced countdowns (e.g., `DEP: 12m`, `IN QUEUE: #03`).
- Left-aligned indicator pip (`6x6px` solid circle) showing pulsing Amber for boardable vehicles, solid Green for full vehicles, and Slate for standby.

### Data Inputs & Keypads
- Massive numpad inputs for fare entry and phone numbers with persistent `48px` cell height.
- Background: `#111817` with a high-contrast border (`#2D3F3B`), shifting to a vivid `#00A859` 2px border on focus.
- Labels sit locked to the top-left in uppercase `label-caps`, with localized Urdu translation mirrored to the top-right in `urdu-sub`.

### Passenger List & Manifest Tables
- Zebra-striped tabular layouts (`#0F1715` alternating with `#141E1C`).
- Explicit dividers with zero-blur horizontal borders.
- Monospaced numerical values aligned strictly to the right; bilingual passenger descriptions aligned to the left.