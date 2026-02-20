# Website Design Prompt: Fashion

You are designing a fashion website. Not a website that MENTIONS fashion. A website that FEELS like fashion — the kind that makes someone pause mid-scroll because the visual impact hit them physically. Think: walking into a Comme des Garçons flagship store, or the first frame of a Jacquemus campaign video. That feeling. On a screen.

---

## Forget Everything About "Normal" Websites

Fashion sites break web conventions intentionally. The rules that apply to SaaS landing pages DO NOT apply here. Specifically:

**Throw away:**
- Centered hero with headline + subtext + button (this is a tech startup, not fashion)
- Card grids with equal spacing (this is a catalog, not a lookbook)
- "About Us" sections with team photos (nobody cares — show the clothes)
- Feature comparison layouts (this isn't a product page)
- Predictable scroll rhythm (same padding, same structure, section after section)

**Replace with:**
- Images that DOMINATE the viewport — 80-100% of visible space is photography
- Typography used as ARCHITECTURE — not labels on top of content, but structural elements that define space
- Asymmetry as the default — nothing is centered unless it's a deliberate moment of calm
- Negative space used AGGRESSIVELY — not just "padding" but empty space that makes you lean forward
- Navigation that's almost invisible — the images are the navigation

---

## Creative Concept: Pick One and Commit Fully

### "The Editorial Spread"
Design the site like a high-fashion magazine. Each scroll position is a new "spread" — image-dominant, with type placed like a magazine layout (overlapping images, running along edges, tucked into corners).
- Two-column asymmetric layouts that shift: image left + text right, then FULL BLEED, then text left + image right, then SPLIT SCREEN
- Pull quotes at massive scale (60-120px) sitting on top of or beside imagery
- Captions and metadata placed like magazine credits: small, bottom-left, almost hidden
- The scroll IS the page turn

### "The Cinematic Scroll"
The site is a film. Each section is a scene. Transitions between sections feel like cuts or dissolves. Images fill the screen completely.
- Full-viewport images, one at a time
- Cross-fade or clip-path reveal between images as you scroll
- Text appears and disappears over images — never in its own "section"
- Sound design optional but powerful (ambient, muted by default)
- Pacing is SLOW — large scroll distances between transitions, letting each image breathe

### "The Anti-Grid"
Deliberately chaotic. Images placed at unexpected positions, overlapping, at angles. Text interrupts images. Nothing aligns to a visible grid. Controlled chaos.
- Images at 30%, 60%, 100% width mixed on the same page
- Elements that overlap: text over image, image over image, caption crossing an image border
- Rotated elements (2-5° — subtle tilt that creates unease)
- Staggered vertical positioning — items don't share a baseline
- Feels like a designer's mood board pinned to a wall

### "The Void"
Nearly black. Products/images emerge from darkness. Maximum drama, minimum everything else. The absence of design IS the design.
- Background: pure black or near-black
- Images float in darkness with no frame, border, or container
- Text is sparse: collection name, maybe a single sentence, nothing more
- Massive gaps between elements — scroll through darkness to reach the next piece
- Feels like a gallery at night with spotlights on each piece

### "The Provocation"
The site is a statement. Aggressive typography, confrontational layout, breaks expectations. Not pretty — STRIKING.
- Display type at 15-25vw (fills the width, wrapping across lines)
- Images cropped dramatically: extreme close-ups, unexpected framing, cut-off compositions
- Color used as shock: one vivid block of color in an otherwise black/white site
- Unconventional scrolling: horizontal, diagonal, or parallax that shifts perspective
- The site almost challenges you to keep scrolling

---

## Typography: Type IS the Design

Fashion typography isn't about readability. It's about PRESENCE.

**The Luxury Move:**
- Didot, Bodoni, or GT Sectra Display at 80-200px
- Ultra-thin weight (100-200) at massive size — elegance through contrast between size and weight
- Letter-spacing: wide (+0.1em to +0.2em) for uppercase, or very tight (-0.05em) for lowercase display
- Line-height: 0.85-0.95 (lines nearly touching)
- The type should feel like it was placed by hand, not generated

**The Contemporary Move:**
- Neue Montreal, Aeonik, or ABC Favorit at 60-150px
- Mixed weight: thin for headlines, bold for a single word of emphasis
- One word in the headline significantly larger than the rest
- Type that bleeds off the edge of the screen (intentionally cropped)

**The Streetwear Move:**
- Druk Wide, Impact, or custom condensed sans at MAX SIZE
- All-caps, filling the viewport width
- Type as texture: repeated, overlapping, layered
- Distressed, glitched, or animated type treatments

**Body text (all fashion):**
- 13-15px — SMALLER than normal websites. fashion sites whisper, they don't explain
- Light weight (300-400)
- Maximum 2-3 sentences per text block. if you're writing paragraphs, you're doing it wrong
- Placed close to images, like captions — not in their own text sections

**The type test:** squint at the page. can you see the typography creating shapes and rhythm even when you can't read it? if yes, it's working. if it looks like uniform text blocks, start over.

---

## Color: Restraint or Violence

Fashion color is never "nice." It's either achingly restrained or deliberately aggressive.

**Black world:**
```
Background:   #000000 (pure black — fashion earns this)
Text:         #FFFFFF
Secondary:    #666666
— nothing else. let the photography provide color
```

**Warm luxury:**
```
Background:   #F5F0E8 (parchment)
Text:         #1A1816 (warm black)
Secondary:    #9A918A
Accent:       none — or ONE unexpected color that appears once
```

**The one-color statement:**
```
Background:   #D42B1E (red) or #1A1AFF (electric blue) or #FF6B00 (orange)
Text:         #FFFFFF or #000000
— the entire site is ONE bold color
— products photographed on matching colored backgrounds
— requires commitment. half-measures look cheap
```

**NEVER:**
- Pastel palettes that look like a baby shower
- Multiple accent colors
- Gradients (unless it's a specific brand element)
- Blue links that look like default HTML

---

## Layout: The Magazine Test

Every section of the site should look like it could be printed as a magazine spread and hung on a wall. If a section looks like a "webpage," redesign it.

### Image Presentation Rules
- **Scale is everything.** Minimum 60% of any viewport should be imagery. 80-100% is better
- **Vary the crop dramatically.** Full body → extreme close-up of fabric → wide environmental → detail of stitching. the variety creates rhythm
- **Never put all images at the same size.** Mix: one massive + two small, or full-bleed + contained, or overlapping at different scales
- **Images should touch or cross boundaries.** Bleed to screen edge. Overlap other elements. Break out of their container. Fashion images don't sit politely in boxes

### Layout Patterns to Use

**The Magazine Spread:**
```
| large image (70%)  | text     |
|                    | small    |
|                    | image    |
```
Then flip it. Then do full-bleed. Then do something else. NEVER repeat the same layout twice in a row.

**The Lookbook Scroll:**
```
[full-screen image 1]
     ↓ scroll
[full-screen image 2]
     ↓ scroll
[image left 40% | image right 60% — different heights]
     ↓ scroll
[text overlay on full-screen image 3]
```

**The Collage:**
Images at different sizes, vertical offsets, possibly overlapping. Like photos scattered on a table. Gaps between them are irregular.

**The Split:**
Left half and right half show different content. One side might be an image, the other text. Or both images. The split can be 50/50, 30/70, or 20/80. The two halves can scroll at different speeds (parallax split).

**The Reveal:**
Content hidden until scroll or interaction. An image that's cropped at 30% and expands to 100% as you scroll past. Text that's invisible until your cursor nears it. A product that rotates into view.

---

## Animation: Cinematic, Not Cute

Fashion animation borrows from film, not UI design.

**Image transitions:**
- **Clip-path reveals** — image wipes in from left/right/center, like a curtain drawing open (600-1000ms)
- **Scale reveals** — image starts at 1.15x and settles to 1.0x as it enters viewport, creating a subtle zoom-out
- **Cross-dissolve** — one image fades into the next (for lookbook sequences)
- **Mask reveals** — image revealed through a shape (circle expanding, rectangle wiping)

**Text animation:**
- Characters or words slide up from below their baseline, one at a time (30-50ms stagger)
- Or: text fades in from 0 opacity simultaneously (simpler, more luxury)
- Or: text is always visible but a highlight/underline draws itself on scroll

**Scroll behavior:**
- Lenis with lerp: 0.06-0.08 (SLOWER than standard — fashion takes its time)
- Images that parallax at different rates (foreground fast, background slow)
- Sections that "pin" — content changes while the section stays in viewport

**Page transitions (mandatory for fashion):**
- Cross-fade with subtle zoom (the minimum)
- Image from grid expanding to fill the next page's hero (shared element transition)
- Color transition: background morphs to match the destination page's palette

**NEVER:**
- Bounce/elastic easing (playful = death in fashion)
- Fast snappy transitions (that's for dashboards)
- Loading spinners (use skeleton screens or no loading indication at all)
- Hover tooltips (fashion doesn't explain itself)

---

## Navigation: Almost Invisible

Fashion navigation should be felt, not seen:

**Options:**
- **Floating minimal:** logo left, hamburger right, both in white/black depending on image behind them. that's it. no visible links until hamburger is clicked
- **Full-screen overlay menu:** hamburger opens to full-viewport menu with large type (40-80px) for each section. background darkens or blurs. this IS the fashion standard
- **No visible nav:** scroll is the only navigation. for lookbook/campaign sites
- **Sidebar/vertical:** links rotated 90° along the left edge. minimal, architectural

**Never:**
- Horizontal nav with 6+ links visible at all times
- Dropdown menus
- Sticky nav that takes up space and competes with imagery
- Nav with icons

---

## Product Presentation (If E-commerce)

- Product image: LARGE. minimum 50% of viewport, ideally larger
- White or solid-color background, perfectly lit
- Hover: second image (worn, different angle) — not a quick-add overlay
- Product name below image, small (14-16px), light weight
- Price smaller than the name, or same size but lighter color
- NO badges, NO "sale" tags, NO "bestseller" labels cluttering the image
- Grid: 2 columns on desktop (not 3 or 4 — give products room)
- Or: single column for premium presentation

---

## Content: Say Less

Fashion sites communicate through images, not words.

- **Hero:** image or video only. maybe a collection name. NO description paragraph
- **Collection pages:** images with titles. NO feature descriptions. NO "shop now" buttons on every item
- **About:** one paragraph maximum. or just a single sentence manifesto
- **Product descriptions:** fabric, care instructions, sizing. factual. not marketing copy
- **Total word count for entire homepage:** under 100 words is ideal. under 200 is acceptable. over 300 means you're talking too much

---

## The Fashion Awe Checklist

- [ ] does the hero make you stop and stare? not read — STARE
- [ ] is photography taking up 70%+ of the visible area at any scroll position?
- [ ] does the typography create visual architecture (not just label content)?
- [ ] are there at least 3 different layout patterns in the first 3 sections?
- [ ] does any section look like it could be a magazine spread?
- [ ] is navigation almost invisible?
- [ ] do the transitions feel like film, not web?
- [ ] is the total text content under 200 words?
- [ ] would you screenshot this and send it to someone? WHICH part?
- [ ] does it feel like a WORLD you want to enter, not a site you want to read?

---

## Reference Sites (Study the FEELING, Not the Structure)

- **Jacquemus** — playful luxury, color as brand, images dominate everything
- **Bottega Veneta** — extreme restraint, product as art object in void
- **Rick Owens** — brutalist fashion, confrontational, the anti-luxury luxury
- **Acne Studios** — perfect editorial pacing, quiet confidence
- **SSENSE editorial** — magazine-meets-commerce, content-first fashion
- **Kenzo** — bold graphic identity, color blocking, pattern as brand
- **The Row** — invisible design, almost nothing on screen, maximum elegance
- **Balenciaga (2021-2023)** — deliberately ugly/provocative, anti-fashion fashion
- **Saint Laurent** — black/white, typography as identity, minimal to the extreme

The lesson: NONE of these sites look like each other. But all of them make you FEEL something within 2 seconds. That's the bar.
