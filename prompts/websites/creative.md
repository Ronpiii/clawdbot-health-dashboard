# Website Design Prompt: Creative Portfolio

You are building a portfolio website for an artist, photographer, creative director, designer, or individual creative professional. This is the most personal category — the site IS the person. It should feel like an extension of their creative identity, not a container for their work.

---

## The Portfolio Imperative

A portfolio site has one job: make someone want to hire/commission/follow this person. Not through persuasion or sales copy. Through demonstrating undeniable creative quality.

**What wins:** showing the work in a way that elevates it. the presentation should feel like an art direction decision, not a layout decision.

---

## Creative Concept Direction

### The Immersive Gallery
"Walk through my world." The site IS an experience — entering the portfolio feels like entering a physical exhibition space.
- Full-screen imagery, one piece at a time
- Transitions between works feel like moving through rooms
- Minimal text — the visuals carry everything
- Dark background (gallery walls), spotlight lighting feel
- Reference: Christoph Rauscher, Yul Moreau

### The Curated Archive
"Here's everything, beautifully organized." The site is an index/archive with smart filtering and rich preview interactions.
- Text-heavy index list with hover previews
- Filter by category/year/medium
- Dense information design that rewards exploration
- Reference: Tobias van Schneider, Raf Simons archive

### The Single Scroll
"One continuous journey." All work presented as a single scrolling experience — a visual autobiography.
- Projects flow into each other vertically
- Scroll-linked transitions between different works
- No pagination, no grid — one river of content
- Reference: Yoichi Kobayashi, Marius Niveri

### The Anti-Portfolio
"I don't need a portfolio site." Minimal to the extreme — name, selected works, email. Confidence through restraint.
- Black/white, no decoration
- Text-only homepage with project titles (images on hover/click)
- Single typeface, single weight
- Contact info and nothing else
- Reference: Virgil Abloh's old site, Frank Chimero

### The Playground
"Explore my brain." Non-linear, experimental, possibly chaotic — the site structure itself is a creative work.
- Draggable elements, custom physics
- Non-standard navigation (spatial, visual, random)
- Generative or interactive visual elements
- Reference: Bruno Simon (3D portfolio), Diana Lange

---

## Typography

Individual portfolios offer maximum typographic freedom:

**For photographers/visual artists:**
- Recede. Don't compete with the images
- Light sans-serif: Neue Haas Grotesk Light, Suisse Int'l Light, Söhne Leicht
- Small sizes (12-14px for metadata), minimal hierarchy
- Let whitespace and imagery dominate

**For designers/art directors:**
- Type IS your design statement
- Pick one font that defines your taste: Canela, GT Sectra, ABC Whyte Inktrap, PP Editorial New
- Use it large and confidently
- Your font choice tells people what kind of designer you are before they see a single project

**For creative directors/strategists:**
- Editorial approach: confident serif for headlines, clean sans for body
- GT Sectra + Söhne, PP Editorial + Inter, Canela + Graphik
- Larger body text (18-20px) — their words matter as much as visuals

**For developers/technical creatives:**
- Monospace prominence: Berkeley Mono, JetBrains Mono, IBM Plex Mono
- Code-aesthetic: terminal green, grid lines, technical metadata
- Or: ultra-clean swiss sans (Helvetica Neue, Akkurat) for contrast

---

## Color

Portfolios should enhance the work, not compete:

**The Neutral Frame (safest for visual work):**
```
Background:  #FFFFFF or #0A0A0A (pick light or dark, commit)
Text:        #111111 or #E8E8E8
Secondary:   #888888
Accent:      none — let the work's colors be the color
```

**The Tinted Frame:**
```
Background:  #F5F1ED (warm) or #EDEFF5 (cool) or #F0F5ED (natural)
— the tint suggests personality without overpowering
```

**The Bold Personal Brand:**
```
Background:  one strong color that IS the brand
— Klein blue, deep red, forest green
— all text white or near-white
— works for creatives with strong visual identity
```

**Rule:** if the portfolio contains photography or visual art, the site's color palette should be as neutral as possible. the frame shouldn't fight the paintings.

---

## Layout

### Image Presentation (Critical)
How you display images defines the entire site:

**Full-bleed (edge to edge):**
- Maximum impact, immersive
- Best for photography, film stills, large-scale visuals
- One image at a time, scroll to next

**Contained with breathing room:**
- Image centered with generous margins
- Creates a "gallery" feeling — each work framed by whitespace
- Best for graphic design, illustration, mixed work

**Grid/mosaic:**
- Multiple works visible simultaneously
- Varying sizes create hierarchy (hero piece larger)
- Good for large bodies of work
- Risk: reduces impact of individual pieces

**Split view:**
- Image on one side, text on other
- Good for projects with a story/context
- 60/40 or 70/30 split, image gets the bigger share

### Project Detail Pages
- Open with the hero image MASSIVE (100vw or close)
- Project title, year, and role in small quiet metadata
- Mix of full-width and contained images
- Brief description (2-3 paragraphs MAX) — show, don't explain
- Related/next work at the bottom

### Image Transitions
The way you move between images is a design statement:
- **Clip-path reveal** — image wipes in from a direction
- **Scale transition** — thumbnail scales up to become the detail view
- **Cross-dissolve** — soft fade between works
- **Slide** — horizontal or vertical movement
- **Morph** — thumbnail morphs into full-screen seamlessly (View Transitions API)

---

## Animation

Portfolio animation should serve the work, not overshadow it:

**For visual-heavy portfolios (photography, art):**
- Subtle reveals: images fade in with slight parallax
- Smooth transitions between works
- Minimal UI animation — don't distract from the imagery
- Cursor changes for navigation hints

**For design/interactive portfolios:**
- Rich transitions that demonstrate craft
- Interactive project previews
- Custom cursor that becomes a design element
- Loader that sets the creative tone

**For experimental/dev portfolios:**
- Go wild — the site IS the portfolio piece
- WebGL scenes, generative art, physics simulations
- Audio integration, spatial navigation
- Push boundaries — this is where you prove your capabilities

**The golden rule:** animation sophistication should match the person's discipline. a photographer's site with WebGL particle effects feels wrong. a creative developer's static site feels wrong.

---

## Page Structure

Portfolios can be radically simple:

**Minimal (1-page):**
```
NAME/LOGO    — top left, small
WORK         — the entire page is the work
ABOUT        — one paragraph, accessible via nav or scroll
CONTACT      — email address, social links
```

**Standard (multi-page):**
```
HOME         — curated selection (5-8 best works)
WORK         — full archive with filtering
ABOUT        — bio, clients, press, awards
CONTACT      — email, form, or just an email address
```

**Experimental (no rules):**
```
— everything on one canvas, spatially arranged
— or: random project on each visit
— or: the work IS the homepage with no chrome
— or: a single page that transforms as you scroll
```

### Navigation
- **Invisible until needed** — hamburger or hover-activated
- **Project-based** — the project list IS the nav
- **Index** — just a list of titles, clickable
- **Minimal fixed** — logo + about + contact only
- No mega-menus. no dropdowns. simplicity.

---

## The Personal Touch

What separates a memorable portfolio from a template:

- **Custom 404 page** — shows personality
- **Colophon/credits** — "built with [stack], typeset in [font]" — shows you care about craft
- **Easter eggs** — konami code, hidden page, cursor trail
- **Favicon that's actually designed** — not a generic icon
- **Loading state** — if it loads, make the loading interesting
- **Selection color** — custom `::selection` color matching the palette
- **Scroll bar** — custom styled or hidden entirely

---

## Reference Sites

| Site | Why It Works |
|---|---|
| Christoph Rauscher | immersive gallery, dark, full-bleed, transitions |
| Bruno Simon | 3D portfolio, the site IS the project |
| Tobias van Schneider | archive-style, dense, text-driven with visual richness |
| Yoichi Kobayashi | scroll-based narrative, experimental transitions |
| Marius Niveri | continuous scroll, work flows together |
| Diana Lange | generative art portfolio, interactive |
| Frank Chimero | anti-portfolio, extreme restraint, confidence |
| Yul Moreau | dark, cinematic, project transitions |

---

## Anti-Patterns

- "Welcome to my portfolio" as a headline
- Identical thumbnail sizes in a grid (Pinterest clone)
- Biography longer than 100 words on the homepage
- Using words like "passionate" or "creative problem solver"
- Skills section with progress bars
- Timeline of career history
- Stock photography or placeholder images
- Social media icons larger than the work
- Testimonials on a personal portfolio (show the work instead)
- Template-obvious layouts (clearly a Squarespace/Wix template)
