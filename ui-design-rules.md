# UI/UX Rules for AI-Generated SaaS Interfaces

## Icons

- never use emoji as UI icons. use a proper icon library (Lucide, Phosphor, Heroicons)
- icons should be functional and informational, not decorative
- icons need no color by default — only use color to communicate status (e.g., active tab)
- use helpful icons in data rows for scannability and subtle color

## Coloring Palette Selection

### monochrome-first philosophy
- START with black, white, and grays only. this is your foundation.
- add ONE accent color for primary actions (CTAs, active states, links). just one.
- add color ONLY for semantic meaning: red (destructive/error), green (success), yellow/amber (warning)
- everything else stays neutral grayscale
- reference: Linear (black/white + one blue), Vercel (pure black/white/gray), Notion (white + grays), Stripe dashboard (white + grays, color only in charts), Raycast (dark + grays + one purple)
- restraint = trust. color everywhere = cheap. color with purpose = professional.

### grayscale hierarchy
- use 4-5 shades of gray to create hierarchy, not color
- primary text: near-black (e.g., `#111` or `#1a1a1a`), NOT pure `#000`
- secondary text: dark gray (e.g., `#666` or `#737373`)
- tertiary/muted text: medium gray (e.g., `#999` or `#a3a3a3`)
- borders: light gray (e.g., `#e5e5e5` or `#eaeaea`)
- backgrounds: white (`#fff`) or very light gray (`#fafafa`, `#f5f5f5`)
- "getting comfortable with gray is what separates mediocre from professional"

### where color IS allowed
- one accent color for: primary buttons, active nav items, links, focus rings
- semantic status: red (error/destructive), green (success/positive), yellow (warning/pending)
- data visualization: charts, graphs, heatmaps — this is where color adds real value
- badges and status indicators (active/inactive, online/offline)
- that's it. if it's not in this list, it should be gray.

### the 60-30-10 rule (when you DO use color)
- 60% dominant neutral color (background, large surfaces)
- 30% secondary color (cards, sections, supporting elements)
- 10% accent color (CTAs, active states, key highlights)
- with monochrome-first: 90% neutrals, 8% accent, 2% semantic colors

### WCAG contrast compliance
- every text-on-background combination must pass WCAG contrast checks
- if a brand color fails with white text, darken it or choose a complementary that passes
- never ship cards with text that fails contrast — it looks cheap and is inaccessible

### dark mode
- dark mode is NOT inverted light mode — build a separate palette
- base background: very dark gray (e.g., `#0a0a0a`, `#111`), NOT pure black
- elevated surfaces: slightly lighter (e.g., `#1a1a1a`, `#222`)
- borders need MORE contrast than light mode — dark colors are harder to distinguish
- body text: light gray (`#a3a3a3` to `#d4d4d4`), NOT pure white
- reserve pure white for only the most important text (headings, key metrics)
- desaturate your accent color slightly in dark mode
- reference: Vercel's dark mode — near-black base, subtle gray elevation, white for emphasis only

### semantic colors
- red = destructive actions (delete, remove). always use red, even if off-brand — usability > branding
- green = success, confirmation
- yellow/amber = warnings, pending states
- these belong in every palette even if they aren't brand colors
- never use your brand color for destructive actions — users won't recognize the danger

### element states
- hover: slightly lighter/brighter version of the base color
- active/pressed: slightly darker version
- disabled: desaturated, lower opacity. light gray background + muted text
- mobile has no hover — use press/click effects instead (subtle background shift on press)
- focus: use your accent color for focus rings (accessibility)

### what NOT to do
- never let AI choose colors — they default to bright, clashing palettes
- never use color "just for the sake of color" — if removing it doesn't hurt clarity, remove it
- never use multiple accent colors competing for attention
- never use bright/saturated backgrounds — backgrounds should recede, not shout

## Layout

- never repeat the same information in multiple places. if KPIs show on the dashboard, don't duplicate them on analytics and sidebar
- sidebars should be minimal — only primary navigation items. tuck secondary actions (settings, billing, profile) into a popover or account card
- remove gradient letter-circle avatars. use a proper account card instead
- cards should be clean: collapse action buttons into a `...` menu, keep metadata minimal
- prefer left-aligned, tight spacing over centered, spread-out layouts
- never let AI choose your layout — AI is generally bad at complex layouts and cards. this is where human time has the highest ROI

## Information Density

- every visible element must DO something. if a card/section is purely decorative or non-functional, remove it
- show micro charts inline instead of large standalone chart blocks
- use two-column layouts to increase density without clutter
- doughnut charts > big number KPIs for usage/billing displays

## Modals & Forms

- if a form has few fields relative to available screen space, use a modal instead of a full page/flyout
- collapse advanced options by default
- always consider what fields are MISSING — AI tends to generate sparse forms

## Pricing & Billing

- limit to 3-4 plans max. if you have 5+, cut the weakest
- make price the largest text element, plan name the smallest
- always show discount amounts explicitly (not just strikethrough)
- highlight what the NEXT tier adds that the current doesn't
- include billing email + payment method on the billing page
- reference pattern: Resend, Supabase pricing layouts

## Analytics

- add toggle to split aggregate data into individual items (e.g., per-link stats)
- use geo maps with shaded regions instead of basic bar charts
- pair visual charts with actual data tables/lists alongside
- add useful metadata rows with icons for color + scannability

## Landing Pages

- never ship an AI-generated landing page without graphics
- use real screenshots of your product (with slight perspective/skew) as hero images
- landing pages are about PRESENTATION, not complexity
- replace generic icons with actual product screenshots showing relevant features
- quality establishes trust subconsciously — this is where most conversions are lost

## Structural Principles

- design for extensibility: use tab-based layouts so new sections (docs, integrations, AI) slot in without redesigning
- AI builds logic well but builds layouts poorly — spend human time on layout and card design
