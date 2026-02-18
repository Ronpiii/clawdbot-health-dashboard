# The Complete UI/UX Design Rulebook

Compiled from top designers and design systems: Refactoring UI (Steve Schoger & Adam Wathan), Erik Kennedy (Learn UI Design), Dieter Rams, Laws of UX, Ian Storm Taylor, Material Design, and patterns from Linear, Vercel, Stripe, Notion.

---

## 1. Foundation Principles

### Dieter Rams — 10 Principles of Good Design
Applied to software:

1. **Good design is innovative** — don't copy patterns blindly. if new technology enables a better interaction, use it
2. **Good design makes a product useful** — every element must serve a function. decorative-only elements degrade the product
3. **Good design is aesthetic** — aesthetics are not optional. ugly tools create friction; beautiful tools invite use
4. **Good design makes a product understandable** — the interface should be self-explanatory. if you need a tooltip to explain a button, the button is wrong
5. **Good design is unobtrusive** — the UI is a tool, not a statement. it should be neutral and restrained, leaving room for the user's content
6. **Good design is honest** — don't make features look more powerful than they are. no fake loading bars, no inflated metrics, no dark patterns
7. **Good design is long-lasting** — avoid trendy styles that will look dated in 2 years. neutral, clean design ages well
8. **Good design is thorough down to the last detail** — nothing arbitrary. every pixel, every spacing value, every color should be intentional
9. **Good design is environmentally-friendly** — in software: respect the user's attention, battery, bandwidth, and time
10. **Good design is as little design as possible** — less, but better. concentrate on the essential. remove everything that isn't necessary

### Laws of UX (Jon Yablonski)
The ones that matter most for SaaS:

- **Hick's Law** — more choices = longer decision time. reduce options. 3-5 nav items, not 12. 3-4 pricing plans, not 6
- **Fitts's Law** — bigger and closer targets are easier to hit. primary CTAs should be large; destructive actions should be small and far from primary actions
- **Miller's Law** — humans hold 7±2 items in working memory. chunk information into groups of 5-7. don't show 20 ungrouped items
- **Jakob's Law** — users expect your app to work like apps they already know. don't reinvent navigation, form patterns, or settings layouts. follow conventions
- **Law of Proximity** — things near each other appear related. use spacing to group related elements and separate unrelated ones. this is MORE powerful than borders or boxes
- **Law of Common Region** — elements inside a shared boundary (card, box) are perceived as grouped. use cards to group related info
- **Doherty Threshold** — keep response time under 400ms or users lose flow. if something takes longer, show a loading state immediately
- **Aesthetic-Usability Effect** — users perceive beautiful interfaces as more usable, even when they're not. invest in aesthetics — it literally makes your product feel better to use
- **Von Restorff Effect** — the element that differs from its surroundings gets remembered. use this for CTAs — make them visually distinct from everything else
- **Peak-End Rule** — users judge experiences by the peak moment and the ending. nail your onboarding (first impression) and confirmation screens (ending)
- **Tesler's Law** — every system has irreducible complexity. someone has to deal with it — either the developer or the user. absorb complexity so users don't have to
- **Postel's Law** — be liberal in what you accept (flexible inputs), conservative in what you send (clean outputs). accept various date formats, phone formats, etc.
- **Pareto Principle** — 80% of users use 20% of features. identify that 20% and make it perfect. the rest can be tucked away
- **Zeigarnik Effect** — people remember incomplete tasks. use progress indicators, checklists, and completion states to motivate users

---

## 2. Layout & Spacing

### Start with too much whitespace
*(Refactoring UI + Erik Kennedy)*

- begin with generous whitespace and reduce as needed — it's easier to remove space than to add it
- when in doubt, double the whitespace you think you need
- whitespace is not "empty" — it's the breathing room that creates hierarchy and clarity
- CSS default is zero spacing. fight that instinct. start from whitespace, add elements into it

### The spacing system
*(Refactoring UI)*

- establish a spacing scale and use ONLY values from it. never eyeball spacing
- recommended scale (based on base-16): `4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256`
- or simpler: `4, 8, 16, 24, 32, 48, 64, 96`
- every margin, padding, and gap should come from this scale
- use the same scale for sizing (icon sizes, avatar sizes, button heights)
- consistency in spacing is what makes designs feel "professional" vs "thrown together"

### Avoid ambiguous spacing
*(Refactoring UI)*

- when elements are equidistant, the eye can't determine which ones are related
- related elements should be CLOSER together than unrelated elements
- the space between a label and its input should be less than the space between two separate form fields
- if two groups have similar spacing, add more space between groups or less within them

### You don't have to fill the whole screen
*(Refactoring UI)*

- don't stretch elements to fill available width just because you can
- a 600px-wide form on a 1400px screen is fine. center it
- content has an ideal width. respect it. don't spread it thin
- sidebars don't need to exist if there's nothing useful to put in them
- max-width constraints are your friend: `max-width: 1200px` for page content, `max-width: 600-700px` for text

### Grids are overrated
*(Refactoring UI)*

- don't force everything into a 12-column grid
- grids are a tool, not a religion. use them when they help, ignore them when they don't
- many great layouts use fixed-width sidebars + fluid main content, not grid columns
- the best layouts come from understanding the content, not from subdividing a canvas

---

## 3. Typography

### Establish a type scale
*(Refactoring UI + Erik Kennedy)*

- define a set of font sizes up front and ONLY use those sizes. never pick an arbitrary size
- recommended modular scale: `12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72`
- or simpler for apps: `12, 14, 16, 20, 24, 32`
- you don't need more than 5-7 distinct sizes in an entire app
- avoid sizes between 14-16px — the difference is too subtle to create meaningful hierarchy

### Hierarchy through weight and color, not just size
*(Refactoring UI — "7 Practical Tips")*

- don't rely solely on font size for hierarchy. use color and weight together
- primary text: dark (not black), normal or semibold weight
- secondary text: medium gray, normal weight
- tertiary/muted text: light gray, normal weight
- stick to two font weights for UI: 400/500 (normal) and 600/700 (bold)
- NEVER use font weights below 400 for UI text — too hard to read at small sizes
- if you need to de-emphasize text, use lighter color or smaller size, not thinner weight

### Line height is proportional
*(Refactoring UI)*

- large text needs less line height (1.2-1.3x)
- body text needs moderate line height (1.5-1.65x)
- small text needs more line height (1.6-1.75x)
- the inverse relationship: as font size goes up, line height ratio goes down
- a single `line-height: 1.5` everywhere is lazy and wrong for headings

### Line length
*(Refactoring UI + Erik Kennedy)*

- optimal line length for body text: 45-75 characters per line
- the sweet spot: ~65 characters
- use `max-width` on text containers, not viewport width
- for paragraphs: `max-width: 65ch` is a simple, reliable rule
- too-wide text is the #1 readability killer on large screens

### Letter spacing
*(Refactoring UI)*

- uppercase text NEEDS increased letter-spacing (tracking) — at least `0.05em`
- large/bold headings often benefit from slightly tighter letter-spacing (`-0.01em` to `-0.03em`)
- body text at normal sizes usually needs no adjustment
- tighter tracking on headings + wider tracking on uppercase labels = professional polish

### Font selection
*(Erik Kennedy + Refactoring UI)*

- for SaaS/apps: use clean, neutral sans-serif fonts
- safe bets: Inter, Satoshi, Source Sans, Figtree, Metropolis, Geist (Vercel)
- don't use more than 2 font families. one is often enough
- pair fonts by contrast (sans-serif heading + serif body), not similarity
- avoid "personality" fonts unless your brand specifically demands them
- test fonts at actual UI sizes (14-16px), not in a type specimen at 72px

### Text on colored backgrounds
*(Refactoring UI — "7 Practical Tips")*

- never use gray text on colored backgrounds — it looks washed out and clashes
- instead: use white text with reduced opacity (lets background bleed through)
- or: hand-pick a color based on the background hue with adjusted saturation/lightness
- the goal is reduced contrast, not gray

---

## 4. Color

### Design in black and white first
*(Erik Kennedy — Rule #2)*

- design the entire interface in grayscale before adding any color
- this forces you to solve hierarchy, spacing, and layout without the crutch of color
- add color LAST, and only with specific purpose
- grayscale + one accent color is a perfectly valid final palette
- reference: Linear, Vercel, Notion, Stripe all follow this principle

### Never use pure black
*(Ian Storm Taylor + Refactoring UI + Erik Kennedy)*

- pure `#000000` black doesn't exist in the real world — everything has some light bouncing off it
- pure black overpowers everything on screen. it kills the subtlety of your other colors
- use near-black instead: `#111`, `#1a1a1a`, or better — a very dark saturated color
- add a hint of your brand hue to your darkest color for richness
- facebook pumps all their grays full of "facebook blue." that's why it feels cohesive
- saturation in grays is proportional to darkness: light grays need 2-3% saturation, dark grays can handle 15-25%

### Grayscale hierarchy
- build hierarchy with 4-6 shades of gray, not with color
- primary text: near-black (`#111` / `#1a1a1a`)
- secondary text: dark gray (`#555` / `#666` / `#737373`)
- tertiary/muted: medium gray (`#888` / `#999` / `#a3a3a3`)
- borders/dividers: light gray (`#e5e5e5` / `#eaeaea`)
- subtle backgrounds: very light gray (`#f5f5f5` / `#fafafa`)
- surface/card backgrounds: white (`#fff`)

### Semantic colors only
- color should communicate MEANING, not decoration
- one accent color for primary actions (buttons, links, active states, focus rings)
- red = error, destructive, danger
- green = success, positive, active
- yellow/amber = warning, pending, caution
- blue = informational, links (if not using brand color)
- never use brand color for destructive actions — users won't recognize the danger

### Use HSL, not hex
*(Refactoring UI + Erik Kennedy)*

- HSL (hue, saturation, lightness) maps to how humans think about color
- hex/RGB is for computers, not designers
- with HSL you can predict what happens when you adjust: rotate hue, lower saturation, raise lightness
- build color palettes by varying saturation and lightness of a fixed hue
- define shades up front: 9 shades per color (50, 100, 200, 300, 400, 500, 600, 700, 800, 900)

### Don't let lightness kill saturation
*(Refactoring UI)*

- as you increase lightness, perceived saturation drops. compensate by bumping saturation up
- very light colors (tints) need higher saturation values to not look washed out
- very dark colors (shades) can have high saturation without looking garish
- rotate hue slightly as you move through shades for richer palettes (warm hues shift toward yellow when lighter, cool hues shift toward blue when darker)

### WCAG contrast
- minimum 4.5:1 contrast ratio for normal text
- minimum 3:1 for large text (18px+ bold or 24px+)
- minimum 3:1 for UI components and graphical objects
- don't rely on color alone to convey information — always pair with text, icons, or patterns
- test with a contrast checker. every time. no exceptions

### Dark mode is a separate design
*(from video rules + Refactoring UI principles)*

- don't just invert your light theme — build a separate palette
- dark backgrounds: very dark gray, not pure black (`#0a0a0a`, `#111`)
- elevated surfaces: progressively lighter grays (`#1a1a1a`, `#222`, `#2a2a2a`)
- borders need MORE contrast than in light mode
- body text: light gray (`#a3a3a3` to `#d4d4d4`), not pure white
- reserve pure white for headings and key metrics only
- desaturate accent colors slightly
- increase spacing slightly — dark interfaces feel more cramped than light ones

---

## 5. Visual Hierarchy & Depth

### Hierarchy is everything
*(Refactoring UI)*

- not all elements are equal. design should make importance immediately obvious
- primary content: large, bold, high contrast
- secondary content: smaller, lighter color, normal weight
- supporting content: smallest, lightest, most muted
- de-emphasize to emphasize — making secondary elements quieter makes primary elements louder by comparison
- "semantics are secondary" — a destructive action doesn't always need to be big and red. if it's not the primary action, de-emphasize it

### Labels are a last resort
*(Refactoring UI)*

- don't add a label to something that's already clear from context
- "Name: Ron V" can just be "Ron V" if it's in a profile card
- when you do use labels, make them the LESS prominent element — the data is what matters
- combine labels into the value itself when possible: "$2,500/mo" not "Price: $2,500 per month"

### Balance weight and contrast
*(Refactoring UI)*

- bold text on a dark background has very high visual weight — sometimes too much
- balance heavy elements by lightening their color or reducing their contrast
- balance light elements by darkening them or making them bolder
- icons with heavy fill can be balanced by using a lighter shade
- a 600-weight gray heading can be more readable than a 700-weight black heading

### Up-pop and down-pop
*(Erik Kennedy)*

- "up-pop" styles increase visibility: bigger, bolder, higher contrast, uppercase, more margin
- "down-pop" styles decrease visibility: smaller, lighter, lower contrast, thinner
- page titles are the ONLY element that should be styled all-out up-pop
- everything else needs a MIX of up-pop and down-pop — slightly more up than down for important elements
- example: a number can be big (up-pop) but light weight and low contrast (down-pop) — it draws the eye without screaming
- example: a label can be small (down-pop) but uppercase and bold (up-pop) — visible when you look for it, invisible when you don't

### Light comes from the sky
*(Erik Kennedy)*

- simulate a top-down light source for all shadow and depth effects
- top edges of elements are lighter, bottom edges are darker
- shadows fall downward and slightly to the side
- inset elements (inputs, pressed buttons): shadow on the top inner edge
- outset elements (buttons, cards, popups): shadow on the bottom outer edge

### Shadows convey elevation
*(Refactoring UI + Material Design)*

- use shadows to show which elements are "above" others, not just for decoration
- interactive/floating elements (modals, dropdowns, popovers): larger, softer shadows
- cards and subtle elevation: small, tight shadows
- use vertical offset on shadows — not just blur. `0 1px 3px` not `0 0 10px`
- two-part shadows look more realistic: a tight sharp shadow + a large diffused shadow
- in dark mode: shadows are less visible. use slightly lighter surface colors instead to convey elevation

### Use fewer borders
*(Refactoring UI — "7 Practical Tips")*

- borders are not the only way to separate elements. overuse makes designs feel cluttered
- alternatives to borders:
  - **box shadow**: subtle outline without the heaviness
  - **different background colors**: adjacent sections in slightly different grays
  - **more spacing**: just increase the gap. simplest and often best
- if you must use a border, use very light gray (`#eee` / `#e5e5e5`), never dark gray or black

---

## 6. Components

### Buttons
*(Refactoring UI — "7 Practical Tips")*

- not every button needs a background color. use hierarchy:
  - **primary action**: solid background, high contrast (your accent color)
  - **secondary action**: outline/ghost style, or lower contrast background
  - **tertiary action**: text-only, styled like a link
- one primary button per view. if everything is emphasized, nothing is
- destructive buttons are only big and red when they're the PRIMARY action (e.g., confirmation dialog). otherwise, de-emphasize them
- button sizes: minimum 36px height for touch (44px recommended by Apple HIG). minimum 32px for desktop
- minimum touch target: 44×44px (Apple HIG) / 48×48dp (Material Design)

### Forms & inputs
- minimum input height: 36-40px desktop, 44-48px mobile
- label above input is the most scannable pattern. left-aligned labels are slowest
- use placeholder text for format hints only, NEVER as labels (they disappear on focus)
- group related fields visually. full name = first + last on same row. address = separate group
- progressive disclosure: show advanced options behind a toggle, not up front
- inline validation: show errors as soon as the field loses focus, not on submit
- required fields: mark optional fields instead of required (most fields are required)

### Cards
- don't put too many actions on a card. collapse into a `...` menu
- maintain consistent card height in grids — use fixed heights or image aspect ratios
- card content hierarchy: image → title → metadata → actions
- use subtle shadow or border, not both
- clickable cards should have a hover state (subtle shadow increase or background change)

### Tables
- left-align text, right-align numbers
- use monospace or tabular-lining figures for number columns
- zebra striping is optional and often unnecessary — increased row padding works better
- table headers: smaller, uppercase, lighter color than cell content
- sortable columns should show sort indicators
- minimum row height: 40-48px for comfortable scanning

### Navigation
- top nav for marketing sites, sidebar nav for apps/dashboards
- 5-7 items max in primary navigation
- active state should be obvious: background color change, bold text, accent border
- mobile: bottom tab bar for primary nav (thumb-zone accessible), hamburger for secondary
- breadcrumbs for deep hierarchies only (>3 levels)
- never nest navigation more than 2 levels deep in a sidebar

### Modals & dialogs
- use modals sparingly — they interrupt flow
- always provide a clear close mechanism (X button, click outside, Escape key)
- modal content should be focused: one task, one decision
- confirmation dialogs: clearly state the consequence, not just "Are you sure?"
- destructive confirmation: make the user type the name of the thing they're deleting
- max width: 480-640px for most modals. full-screen modals for complex forms only

---

## 7. Icons

- use a single, consistent icon library throughout the app (Lucide, Phosphor, Heroicons)
- never mix icon styles (outlined vs filled vs solid) in the same context
- icons at 16-24px are designed for that size. don't blow them up to 48px — they'll look chunky
- if you need large icons: enclose small icons in a colored circle/rounded-square background
- icons should be recognizable WITHOUT labels in navigation. if they're not, add labels
- icon + label is almost always better than icon alone for clarity
- monochrome icons by default. color only for status or active states

---

## 8. Images & Media

### Photos
*(Refactoring UI)*

- use good photos. a bad stock photo is worse than no photo
- if you use stock photos, add a subtle color overlay or desaturate to unify with your brand
- user-uploaded content is unpredictable — always use aspect ratio containers and object-fit: cover

### Text on images
*(Erik Kennedy — 5 methods)*

1. **Dark overlay**: semi-transparent black over the entire image, white text on top
2. **Text-in-a-box**: translucent dark rectangle behind the text
3. **Blur**: blur the area behind the text
4. **Floor fade**: gradient from transparent to dark at the bottom of the image
5. **Scrim**: elliptical gradient behind specific text
- white text on images almost always. finding a clean counter-example is nearly impossible

### Accent borders
*(Refactoring UI — "7 Practical Tips")*

- add a small colored border (4-5px) to the top or left of bland elements
- works on: alert boxes, cards, navigation items, page headers
- zero design talent required — just a colored rectangle — but it makes things feel designed
- top-of-page accent borders are an easy way to add brand color without overwhelming

---

## 9. Responsive & Accessibility

### Responsive principles
- design mobile-first: solve the harder problem (small screen) first
- breakpoints should be based on content, not device sizes
- common breakpoints: 640px (phone), 768px (tablet), 1024px (laptop), 1280px (desktop)
- don't hide content on mobile — re-flow it. stack columns vertically
- touch targets: minimum 44×44px with at least 8px between targets
- test at actual device widths, not just by resizing your browser

### Accessibility beyond contrast
- every interactive element must be keyboard accessible (Tab, Enter, Escape, Arrow keys)
- visible focus indicators on all interactive elements — NEVER `outline: none` without a replacement
- use semantic HTML: `<button>` for actions, `<a>` for navigation, `<input>` for data entry
- all images need alt text. decorative images get `alt=""`
- form inputs need associated `<label>` elements, not just placeholders
- error messages should be specific: "Password must be at least 8 characters" not "Invalid input"
- support reduced motion: `prefers-reduced-motion` media query
- color is never the ONLY indicator — pair with text, icons, or patterns
- screen reader testing: announce dynamic content changes with `aria-live`

---

## 10. Process & Mindset

### Design in the browser / in constraints
*(Refactoring UI + Erik Kennedy)*

- start with a feature, not a layout. design the core interaction first, then build outward
- don't design too much up front. design the simplest version, ship it, iterate
- detail comes later — start with low-fidelity (wireframe/grayscale), add polish in passes
- choose a personality early: playful vs serious, modern vs classic. this constrains font, color, border-radius decisions

### Limit your choices
*(Refactoring UI)*

- pre-define systems for everything: spacing scale, type scale, color palette, shadow scale, border-radius values
- when everything is pre-decided, individual design decisions become fast
- design tokens: define once, use everywhere. no magic numbers
- recommended border-radius scale: `0, 2, 4, 6, 8, 12, 16, 9999` (full rounded)

### Steal like an artist
*(Erik Kennedy — Rule #7)*

- find 2-3 apps you admire and study their patterns obsessively
- copy specific techniques (spacing ratios, shadow values, color relationships), not whole layouts
- Dribbble, Mobbin, and Screenlane are goldmines for component patterns
- when stuck, screenshot an app you like and measure everything: spacing, sizes, colors, shadows
- the fastest path to good design is understanding why something good works, then applying the same reasoning

### Reference products for SaaS
- **Linear**: the gold standard for monochrome + one accent. perfect keyboard shortcuts, transitions, information density
- **Vercel**: pure black/white/gray. proof that near-zero color works beautifully
- **Notion**: white canvas, barely-there UI. proof that the content IS the interface
- **Stripe**: best-in-class dashboard design. charts, tables, data density
- **Raycast**: dark mode done right. one accent color, perfect spacing
- **Cal.com**: excellent form design, clear hierarchy
- **Resend**: clean billing/pricing patterns
- **Supabase**: data-heavy UI done cleanly

---

## Quick Reference Cheat Sheet

| Property | Value |
|---|---|
| Base font size | 16px (web), 17px (iOS), 14-16sp (Android) |
| Body line height | 1.5-1.65 |
| Heading line height | 1.2-1.3 |
| Max line length | 65 characters (~600-700px) |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48, 64, 96 |
| Min touch target | 44×44px |
| Min button height | 36px (desktop), 44px (mobile) |
| Contrast ratio (text) | ≥4.5:1 (normal), ≥3:1 (large) |
| Max nav items | 5-7 |
| Max pricing plans | 3-4 |
| Page max-width | 1200-1440px |
| Modal max-width | 480-640px |
| Border radius scale | 0, 2, 4, 6, 8, 12, 16, 9999 |
| Shadow (subtle) | 0 1px 2px rgba(0,0,0,0.05) |
| Shadow (medium) | 0 4px 6px rgba(0,0,0,0.07) |
| Shadow (large) | 0 10px 15px rgba(0,0,0,0.1) |
| Animation duration | 150-300ms (micro), 300-500ms (macro) |
| Response time ceiling | <400ms (Doherty Threshold) |
