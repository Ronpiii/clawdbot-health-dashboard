# Website Design Prompt: Fashion

You are building a website for a fashion brand, clothing label, luxury house, or lifestyle brand. Fashion sites are where design meets desire — the site should make visitors WANT. Every pixel should evoke the same feeling as touching the fabric in a flagship store.

---

## The Fashion Website Philosophy

Fashion sites aren't informational — they're emotional. Nobody visits a fashion site to "learn about the product features." They visit to FEEL something: aspiration, desire, belonging, identity. The site must create a world the visitor wants to be part of.

**What wins:** atmosphere over information. imagery over copy. feeling over function.

---

## Creative Concept Direction

### The Lookbook
"Flip through a visual story." The site functions as a digital editorial — each collection is a story told through photography, styling, and atmosphere.
- Full-screen imagery, magazine-style pacing
- Minimal UI — the photos ARE the interface
- Scroll = turning pages
- Text overlaid on or woven into photography
- Reference: Acne Studios, COS, Jacquemus

### The Flagship Store
"Step inside." The site replicates the feeling of walking into a beautifully designed physical space.
- Clean, structured, luxurious spacing
- Product presented like objects in a gallery
- Lots of whitespace — products breathe
- Subtle motion: images that respond to cursor, parallax depth
- Reference: Bottega Veneta, Aesop, The Row

### The Culture Brand
"We're not selling clothes, we're selling a world." The site leads with editorial content — culture, music, art — and integrates product naturally.
- Magazine/blog-forward homepage
- Editorial photography mixed with product
- Video content prominent
- Community/culture feel over commerce
- Reference: Stüssy, Palace, Brain Dead

### The Statement
"Maximum visual impact." Bold, confrontational, unapologetic — the site is as aggressive as the brand.
- Giant typography, dramatic photography
- High contrast (black/white, or vivid color blocking)
- Unconventional layout and navigation
- Sound/music integration
- Reference: Rick Owens, Balenciaga (when Demna was pushing it), Vetements

---

## Typography

Fashion typography is critical — it signals market position instantly:

**High fashion / luxury:**
- Thin, elegant serifs: Didot, Bodoni, GT Sectra Display
- Or: ultra-clean sans: Helvetica Neue, Neue Haas Grotesk, Futura
- Weight: thin/light (100-300) at large sizes
- Tracking: wide (+0.05em to +0.15em) for uppercase, tight for display
- Luxury = restraint. one font, one weight, maximum composure

**Contemporary / mid-range:**
- Grotesque sans: Neue Montreal, Aeonik, GT America
- Mix of weights: light for display, medium for body
- Clean but with personality — not as austere as luxury

**Streetwear / culture:**
- Bold, sometimes brutalist: Druk, Impact, Compacted sans-serifs
- Or: hand-drawn, custom lettering
- Mixed sizing and weight for energy
- Rule-breaking: overlap, rotation, unconventional placement
- All-caps is more acceptable in streetwear than any other category

**Body text (all fashion):**
- Small and quiet: 14-16px (fashion sites trend smaller than other categories)
- Light weight
- Wide letter-spacing for uppercase labels
- Fashion sites can get away with lower readability in exchange for aesthetics (this is the ONE category where that trade-off is acceptable)

---

## Color

Fashion color palettes should evoke a specific material/textural quality:

**The Luxury Neutral:**
```
Background:  #FAFAF7 (warm white) or #F5F1EB (cream)
Text:        #1A1A1A
Secondary:   #9A9590 (warm gray)
Accent:      none — monochrome with photography providing all color
Borders:     #E8E3DC
```

**The Fashion Black:**
```
Background:  #000000 (fashion is one category where pure black works)
Text:        #FFFFFF
Secondary:   #777777
— dramatic, editorial, high contrast
— lets the photography POP
```

**The Tinted World:**
```
— one color defines the entire season/collection
— dusty rose #D4A0A0, sage #9CAF88, camel #C4A77D, ice blue #B8D4E3
— everything tinted: backgrounds, overlays, hover states
— creates a cohesive "world" for the collection
```

**The Bold Block:**
```
— vivid, saturated color as background
— electric blue, cherry red, acid yellow
— product photographed on colored backgrounds matching the site
— streetwear/culture brands, not luxury
```

---

## Layout

### The Gallery Grid
Fashion sites need editorial image presentation:

**Masonry/collage:**
- Mixed aspect ratios and sizes
- 2-3 column layout with items at different vertical positions
- Creates a "mood board" feeling
- Best for: lookbooks, editorial collections

**Full-bleed hero + grid below:**
- One hero image (100vw, 100vh)
- Scroll to reveal product grid beneath
- Best for: e-commerce with editorial opening

**Alternating large/small:**
- One full-width image → two side-by-side → one full-width → three in a row
- Creates rhythm and pacing like a magazine spread
- Best for: collection presentations, lookbooks

**Single column scroll:**
- One image at a time, full screen
- Arrow or scroll to navigate
- Maximum drama, minimum distraction
- Best for: campaign imagery, film/video

### Product Presentation
- Product images should be LARGE — minimum 60% of viewport
- Clean backgrounds (white, off-white, or solid color)
- Multiple angles accessible without page navigation (hover/click to rotate)
- Model photography alongside flat-lay/still-life
- Hover on product: second image (worn/different angle) — NOT a quick-add modal

### Whitespace
Fashion uses MORE whitespace than any other category. Products need room to breathe. Margins should feel luxurious:
```
Section gaps:     160-240px (MORE than standard)
Product grid gap:  16-32px (tighter in grid, contrast with section spacing)
Image margins:    80-120px from container edge (for non-full-bleed)
Text margins:     generous, centered, max-width 500-600px
```

---

## Animation & Interaction

Fashion motion should feel like film, not UI:

**Image reveals:**
- Clip-path animations — images reveal with a wipe/curtain effect
- Images that load with a subtle scale-up from 1.05x to 1x
- Crossfade between lifestyle and product shots on hover
- Parallax layers: text + image moving at different speeds

**Scroll behavior:**
- Smooth, cinematic scroll (Lenis with lower lerp: 0.07-0.08 for a more luxurious feel)
- Images that scale or transform as you scroll past
- Fixed images that change while text scrolls over them
- Horizontal scroll for collection galleries

**Transitions:**
- Page transitions are ESSENTIAL for fashion sites
- Cross-dissolve with slight zoom (most common in luxury)
- Product image expanding from grid to fill the detail page
- Color transitions: background color morphs between pages to match collection

**What NOT to animate:**
- Don't animate product interactions — add-to-cart, size selection, etc. should be snappy and functional
- Don't use "fun" animations (bounces, wobbles) for luxury
- Don't slow down the shopping flow with elaborate transitions

**Timing for fashion:**
```
Image reveals:     600-1000ms (slower = more cinematic)
Page transitions:  700-1200ms (luxury takes its time)
Hover on product:  200-300ms crossfade
Scroll parallax:   continuous, 10-20% offset
Text reveals:      400-600ms, 100ms stagger
```

---

## Page Structure

### E-commerce Fashion Site
```
NAV          — centered logo, minimal links
             — collection names as primary nav (not "Shop")
             — cart icon, search, menu

HERO         — full-screen campaign image or video
             — collection name overlaid, minimal
             — NO description text. let the image speak

COLLECTION   — editorial opening (2-3 large images)
             → transitions to product grid below

LOOKBOOK     — editorial imagery (not product shots)
             — scroll-through gallery of the season's world

PRODUCT GRID — clean, generous spacing
             — image → name → price (no other info)
             — filter by category, not by "feature"

EDITORIAL    — brand stories, behind-the-scenes, interviews
             — presented like magazine articles

FOOTER       — newsletter signup (prominent)
             — minimal links, social
```

### Brand/Lookbook Site (non-commerce)
```
HERO         — full-screen video or image sequence
COLLECTION   — scroll-through lookbook, one image at a time
ABOUT        — brand story, values, heritage
STOCKISTS    — where to buy
CONTACT
```

---

## Photography Direction

The photography IS the design in fashion:
- **Consistent color grading** across all images (this is non-negotiable)
- **Lifestyle + still life** — both are needed for a complete presentation
- **Editorial quality** — not Amazon-style product shots
- **Contextual** — show the world the clothes live in
- **Crop with intention** — tight crops on details, wide for silhouettes
- If using model photography: diverse casting, natural poses, not stock-model-stiff

---

## Reference Sites

| Site | Why It Works |
|---|---|
| Acne Studios | perfect minimal luxury, incredible image pacing |
| COS | clean, structured, Scandinavian restraint |
| Jacquemus | playful luxury, Instagram-native aesthetic, bold color |
| Bottega Veneta | ultra-luxe, extreme restraint, product as art |
| Aesop | tactile, warm, product as ritual (not fashion but aspirational) |
| Stüssy | culture-first, editorial + commerce blended |
| Rick Owens | brutalist fashion, anti-luxury luxury |
| SSENSE | editorial commerce, magazine-forward shopping |
| The Row | extreme minimalism, almost nothing on screen |
| Kith | streetwear + editorial, culture hub |

---

## Anti-Patterns

- Pop-up modals for newsletter within 2 seconds of arrival
- Product images smaller than 400px
- "Shop Now" as the hero CTA (show, don't sell)
- Generic product description copy ("this versatile piece...")
- Feature-focused product description (material list) instead of story
- Cluttered product pages with cross-sells, recommendations, and badges
- Stock model photography with watermarks or inconsistent styling
- Filters with 20+ options on a small collection
- Aggressive sale/discount banners ruining the aesthetic
- Social media feeds embedded directly (breaks the visual world)
- Background music that auto-plays (debatable — some luxury sites do this intentionally)
