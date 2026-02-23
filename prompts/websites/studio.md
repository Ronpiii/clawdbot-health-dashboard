# Website Design Prompt: Studio

You are building a website for a design studio, creative studio, or development studio. Studios are smaller and more personal than agencies — the site should feel like stepping into someone's workspace. Intimate, opinionated, handcrafted.

---

## Studio vs Agency

The key difference: agencies sell services at scale. Studios sell a perspective. Studio sites should feel authored — like a single creative vision runs through every detail. The personality of the founders should be palpable.

**What wins:** sites that feel like they were built by a specific person/team with a specific point of view, not generated from a template.

---

## Creative Concept Direction

### The Atelier
"Step into our workshop." The site feels handmade, tactile, almost physical. Think paper textures, custom illustrations, hand-drawn elements mixed with precise digital craft.
- Grain textures, subtle noise overlays
- Custom illustrations or hand-lettered elements
- Organic shapes mixed with structured grids
- Warm color palette (cream, charcoal, terracotta, olive)
- Reference: Studio Freight, Holographik

### The Lab
"We experiment here." The site itself is an experiment — pushing technical boundaries, using the medium as the message. Every section has a different treatment.
- WebGL shaders, generative art, particle systems
- Interactive elements that respond to mouse/scroll in unexpected ways
- Code aesthetics: monospace type, terminal-inspired elements
- Dark mode with neon/vivid highlights
- Reference: Aristide Benoist, Unseen Studio, Monopo

### The Gallery
"Our work is art." Minimal site chrome, maximum visual impact. Each project is presented like a gallery exhibition — clean, contemplative, with room to breathe.
- Full-bleed imagery with extreme whitespace
- One project visible at a time, scrolling vertically or horizontally
- Almost no UI visible — the work IS the interface
- Reference: Toko, Studio Dumbar, Hey Studio

### The Manifesto
"We believe in something." The studio's philosophy is the centerpiece — design principles, manifestos, opinionated takes on the industry. The work proves the philosophy.
- Typography-driven, text-heavy hero
- Editorial layout with essays/writing mixed into the portfolio
- Strong voice in all copy
- Reference: Pentagram, Wolff Olins, Sagmeister & Walsh

---

## Typography

Studio sites are where you can take the biggest typographic risks:

**Display:**
- Editorial serifs: PP Editorial New, Canela, GT Sectra, Freight Display
- Expressive sans: ABC Favorit, Whyte Inktrap, GT Alpina
- Or go ultra-clean: Söhne, Neue Haas Grotesk, Akkurat
- Size: 80-200px+ on desktop. studios can go BIGGER than agencies because the type IS the design
- Weight: mix extremes — 100 (thin) for oversized display paired with 800 (heavy) for emphasis

**Body:**
- Keep it readable: Inter, Source Sans, Untitled Sans, Suisse Int'l
- 17-20px for body text (studios tend slightly larger, more editorial)
- Line-height 1.6-1.7

**The studio signature:** pick ONE unusual typeface that becomes your brand. not Inter. not system fonts. something with personality that visitors will remember.

**Typographic techniques to use:**
- Text masking (type filled with video or images)
- Mixed case in a single headline (lowercase + uppercase for emphasis)
- Oversized single words as section dividers
- Pull quotes at 3-4x body size
- Variable font animation (weight/width changing on hover or scroll)

---

## Color

Studios have more freedom than agencies. Choose based on personality:

**The Warm Studio:**
```
Background:  #F5F0EB (warm cream)
Surface:     #FFFDF9
Text:        #2D2A26 (warm near-black)
Secondary:   #8A8478 (warm gray)
Accent:      #C4642A (burnt orange) or #6B7F4E (sage) or #9C4B3E (terracotta)
Borders:     #E5DFD7
```

**The Dark Studio:**
```
Background:  #0C0C0E (cool near-black)
Surface:     #161618
Text:        #E8E8E8
Secondary:   #7A7A7E
Accent:      #4AE8A0 (mint) or #FF6B6B (coral) or #A78BFA (lavender)
Borders:     #2A2A2E
```

**The Monochrome Studio:**
```
Background:  #FFFFFF
Text:        #000000 (studios CAN use pure black if the concept is contrast)
Secondary:   #666666
Accent:      none — or color appears only in project imagery
Borders:     #EEEEEE
```

**The Bold Studio:**
```
Background:  #1A1AFF (saturated blue) or #FF4444 (red) or #0D0D0D (black)
Text:        #FFFFFF
— color AS the brand, not color as decoration
— works when the entire site commits to the palette
```

---

## Layout

Studio sites should feel curated, not systematic. Each section can have its own personality:

### Work Presentation
- **Single column deep scroll** — one project at a time, full-width images, scrolling through like flipping pages
- **Horizontal scroll strip** — projects laid out horizontally, scrolling sideways
- **Index list** — text-only project list with image preview on hover (the "Lusion approach")
- **Mixed media collage** — images of varying sizes, overlapping, creating a mood board feel

### Project Hover States
Studios should have the richest hover interactions:
- Cursor becomes a preview window showing the project
- List item expands to reveal project imagery
- Image color-shifts or distorts on hover
- Video preview plays on hover (muted, auto)
- The hover interaction itself should feel "designed"

### About Section
Studios are personal — the about should be too:
- Founder(s) photographed in their actual workspace
- Written in first person ("I believe..." or "We believe...")
- Short, opinionated bio — not a corporate history
- Tools/process shown through real artifacts, not icons

---

## Animation

Studio sites should have at least ONE technically impressive animation that visitors will talk about:

**Ideas for the signature moment:**
- Hero text that assembles from scattered characters
- Project images that tear apart into particles on scroll
- A 3D room/space you navigate through
- Scroll-triggered type that changes weight continuously
- An interactive generative background that responds to mouse movement
- Page transitions where the current page folds/crumples away

**Motion personality should match studio personality:**
- Warm/craft studio → organic easing, gentle movements, soft bounces
- Technical/lab studio → precise, snappy, cubic-bezier, geometric
- Minimal/gallery studio → barely there motion, slow fades, subtle parallax
- Bold/expressive studio → aggressive movements, fast reveals, scale jumps

**Timing for studios:**
```
Scroll reveals:   500-800ms (slightly slower = more contemplative)
Page transitions:  600-1000ms (more elaborate than agencies)
Hover:            150-200ms enter, 300-400ms exit
Text stagger:     50-80ms per word
Image reveal:     800-1200ms (clip-path or mask animation)
```

---

## Page Structure

Studios are less formulaic than agencies. Consider non-linear structures:

**Option A: The Scroll Experience**
```
HERO         — full-screen typographic statement or video
WORK         — projects as a continuous scroll-story
PHILOSOPHY   — 1-3 sentences about what you believe
CONTACT      — simple, personal ("say hello")
```

**Option B: The Index**
```
NAV          — logo + project index + about + contact
HERO         — project index list (text) with hover previews
              the portfolio IS the homepage
FOOTER       — email, social, legal
```

**Option C: The Magazine**
```
HERO         — latest project or editorial piece, magazine-style
FEATURED     — curated selection of recent work
WRITING      — blog/essays/thoughts mixed with portfolio
ABOUT        — studio philosophy + team
CONTACT
```

---

## Navigation

Studios can experiment with navigation more than agencies:
- **Minimal fixed nav** — logo + hamburger only, menu opens as fullscreen overlay
- **Vertical nav** — rotated text along the left edge
- **No visible nav** — scroll to navigate, or gesture-based
- **Index as nav** — the project list IS the navigation
- Full-screen menu overlay with large type and project previews

---

## Reference Sites

| Site | Why It Works |
|---|---|
| Studio Freight | warm, tactile, handcrafted feeling with technical excellence |
| Unseen Studio | dark, experimental, every detail is a design choice |
| Holographik | organic textures mixed with digital precision |
| Lusion | 3D/WebGL craft, site as a technical demo |
| Toko | ultra-minimal, work speaks for itself |
| Aristide Benoist | personal, portfolio-as-experiment |
| Monopo | Japanese design sensibility, precise and unexpected |
| Hey Studio | colorful, illustrative, personality-driven |
| Dogstudio | immersive, dark, technically impressive |

---

## Payload CMS — Studio Content Model

Build with Payload 3 embedded in Next.js. Studio owners can manage their portfolio and content.

### Collections
- **Projects** — title, slug, category (select: design/development/branding/etc), year, description, hero media, content (rich text + images), collaborators, link
- **Media** — with image sizes: thumbnail (400w), project (1200w), fullscreen (1920w)
- **Posts** — journal/thoughts (studios often have editorial voice)
- **Pages** — block-based (about, contact, etc.)

### Blocks
- **ProjectGallery** — variant (masonry / sequential / cinema — full-bleed images one at a time)
- **EditorialText** — rich text with pull quotes, custom typography options
- **StudioInfo** — bios, location, philosophy (variant: side-by-side / stacked)
- **ContactForm** — fields config, optional map embed
- **Marquee** — scrolling text/logos with speed + direction
- **Testimonials** — single featured or stacked
- **CTA** — minimal, personality-driven

### Globals
- **Header** — logo (image or text), nav (keep minimal — 3-5 links)
- **Footer** — contact info, social, one-liner
- **SiteSettings** — studio name, tagline, OG defaults

---

## Anti-Patterns

- Looking like an agency (too corporate, too systematic)
- Generic project grid with uniform thumbnails
- "About us" that reads like a LinkedIn profile
- Using the same template as every other studio on Awwwards
- No personality in the typography — defaulting to Inter/Helvetica
- Hover states that are just opacity changes
- No animation beyond basic scroll reveals
- Using stock imagery anywhere
