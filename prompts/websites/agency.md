# Website Design Prompt: Agency

You are building a website for a digital agency, marketing agency, or consultancy. Agency sites are the hardest to get right because your audience IS designers and developers — they will judge every pixel. Your site must demonstrate that you practice what you sell.

---

## The Agency Paradox

Agency sites have a unique problem: they must simultaneously be the portfolio, the pitch deck, and the proof of capability. Visitors arrive thinking "convince me you're better than the other 500 agencies." You have about 5 seconds.

**What wins:** showing your work FIRST and letting quality speak. not walls of text about "synergizing digital transformations."

---

## Creative Concept Direction

Agency sites that win awards almost always commit to ONE of these identities:

### The Craft Showcase
"Our site IS the portfolio piece." Every interaction, transition, and animation demonstrates technical and creative mastery. The site itself is your best case study.
- Custom cursor that reacts to context (text, image, link, drag)
- Page transitions that morph shared elements between routes
- WebGL/3D elements integrated naturally (not gimmicky)
- Custom scroll behaviors and viewport-linked animations
- Reference: Basement Studio, Active Theory, Resn

### The Work-First Gallery
"We let the work speak." Minimal chrome, maximum case study presentation. The site recedes so the projects can shine.
- Full-bleed project imagery with hover reveals
- Project grid that doesn't look like every other project grid (staggered, varied sizes, overlapping)
- Smooth transitions INTO case studies (image expands to fill viewport)
- Minimal navigation — work is the navigation
- Reference: Huge Inc, Instrument, ueno

### The Editorial Authority
"We're thinkers, not just makers." Positions the agency as intellectual leaders through editorial design and content.
- Magazine-style layout with columns, pull quotes, feature articles
- Rich typography with serif headlines
- Blog/insights section that's as well-designed as the rest of the site
- Reference: Red Antler, Pentagram, Collins

### The Bold Statement
"You know immediately who we are." Maximum personality, polarizing by design. Not for everyone — and that's the point.
- Dark mode, vivid accent, aggressive typography
- Unconventional navigation (vertical, hidden, unusual)
- Strong motion design with personality
- Reference: Locomotive, BASIC/DEPT, Dogstudio

---

## Typography

Agency sites MUST demonstrate typographic mastery. This is where clients judge your taste.

**Display/Hero:**
- Neue Montreal, Aeonik, ABC Favorit, PP Neue Machina, GT America, Founders Grotesk
- Weight: 400-500 at massive sizes (80-200px). heavy weights at large sizes look amateurish
- Tracking: -0.03em to -0.05em

**Body:**
- Inter, Suisse Int'l, Graphik, Söhne, Untitled Sans
- Size: 16-18px, line-height 1.6

**Accent (metadata, labels, categories):**
- Monospace: JetBrains Mono, IBM Plex Mono, Berkeley Mono
- Uppercase, tracked out (+0.08em), 11-12px
- Used for: project categories, dates, labels, counters

**The power move:** mix a confident grotesque display font with a restrained body sans-serif and monospace accents for metadata. three roles, three fonts, one system.

---

## Color

Agencies tend toward two extremes:

**Monochrome authority:**
- Near-black background (#0D0D0D, #111)
- White text, gray metadata
- ONE vivid accent for interaction states and CTAs
- Accent options: electric blue (#0066FF), signal red (#FF3333), acid green (#00FF66), hot orange (#FF6B35)

**Clean and restrained:**
- White/off-white background (#FAFAFA)
- Near-black text (#111)
- Subtle warm or cool gray tint on all neutrals
- Color only in project imagery and hover states

**Anti-pattern:** rainbow gradients, multiple brand colors competing, "creative" ≠ colorful

---

## Layout Patterns

### Project Grid (The Make-or-Break Element)
NEVER use a uniform grid of identical-sized project cards. Mix these:
- **Masonry** with varied aspect ratios (landscape, portrait, square mixed)
- **Bento grid** — one large hero project + 2-4 smaller surrounding
- **Staggered rows** — items offset vertically, creating visual rhythm
- **Single column** — one project at a time, full-width, scrolling vertically
- **Horizontal scroll** — projects in a sideways-scrolling strip

Each project thumbnail should:
- Show the WORK, not a generic cover
- Reveal title/category on hover (not always visible)
- Have a hover state that demonstrates craft (image zoom + overlay, video preview, color shift)
- Transition into the case study smoothly (shared element animation)

### Case Study Pages
- Open with a full-bleed hero image/video of the project
- Include the brief, the approach, and the results — but visually, not as text blocks
- Mix image sizes: full-width, contained, side-by-side, overlapping
- Show process: before/after, wireframes, iterations
- End with next/prev project navigation that shows the next project's imagery

### About/Team
- Team photos should be candid, not corporate headshots
- Grid of faces with hover revealing name/role
- Or: no photos at all, just names and roles (the anti-corporate move)
- Culture shown through real office/workspace imagery

---

## Animation & Interaction

Agency sites live or die by motion quality:

**Required:**
- Custom cursor (circle that scales on hover, changes shape for different contexts)
- Magnetic nav items (subtle pull toward cursor)
- Page transitions between ALL routes (not just fade — morph, slide, scale)
- Project image hover: subtle zoom (1.03-1.05x) + overlay + title reveal
- Scroll-triggered text reveals with character/word stagger

**Differentiators:**
- WebGL image distortion on hover (ripple, displacement, RGB shift)
- Scroll velocity affecting animation speed
- Loading screen that's itself a design piece (not just a spinner)
- Footer that reveals by scrolling "past" the main content (fixed behind, parallax reveal)

**Timing:**
```
Cursor:           instant tracking, 150ms scale
Hover:            100ms enter, 250ms exit
Page transition:  500-800ms
Scroll reveal:    400-600ms per element, 50-80ms stagger
Text split:       40-60ms per word, 20-30ms per character
```

---

## Page Structure

```
NAV          — logo left, minimal links (Work, About, Contact), CTA right
             — fixed, transparent over hero, solid on scroll
             — hamburger on mobile opens full-screen overlay

HERO         — NOT a tagline. show your best recent project
             — full-bleed video/image with project link
             — or: typographic statement ("We build digital experiences")
             — animated text entry, 3 seconds max to fully load

WORK         — featured projects grid (4-8 projects)
             — varied sizes, hover reveals, smooth transitions
             — "View all work" link to full project archive

CAPABILITIES — what you do, shown with motion/interaction
             — NOT bullet points. use: horizontal scroll of services,
               sticky sidebar with animated content, or icon-less cards
             — keep it concise: 4-6 services max

CLIENTS      — logo bar, monochrome/grayscale, small
             — or: testimonial quote with client name/company

ABOUT        — team, culture, philosophy in 2-3 sentences max
             — link to full about page

CONTACT CTA  — full-width dark section, clear CTA
             — "Have a project?" with email or form link

FOOTER       — minimal: email, social links, legal
             — consider: footer as a hidden panel that reveals on overscroll
```

---

## Reference Sites

| Site | Why It Works |
|---|---|
| Basement Studio | dark + 3D + custom cursor, pure technical craft |
| Active Theory | immersive interactive experiences, site IS the portfolio |
| Locomotive | bold dark aesthetic, incredible page transitions |
| Huge Inc | work-first, clean, projects are the stars |
| Instrument | editorial quality, projects presented like magazine features |
| Resn | playful, unexpected, pushes boundaries |
| Red Antler | editorial authority, branding expertise visible in every detail |
| Lusion | 3D/WebGL showcase, creative studio pushing the medium |

---

## Anti-Patterns (What Makes Agency Sites Boring)

- "We're a full-service digital agency" as a hero headline
- Equal-sized project grid thumbnails
- Stock illustrations of "teamwork" and "creativity"
- Excessive text about process and methodology before showing work
- Generic "Get in touch" CTAs with no personality
- No page transitions — every navigation is a hard reload
- Team page with LinkedIn headshots on white backgrounds
- Services listed as bullet points with generic icons
