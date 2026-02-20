# Ventok Website — Pencil.dev Design Prompt

## Brand
**Ventok** — a digitalization studio in Tallinn, Estonia. We build operational backbones for small companies (5-50 employees): business infrastructure, process automation, and AI-augmented workflows. Our tagline: "build the backbone. then make it think."

## Site Type
Business services website. Bilingual (Estonian + English). Must convert visitors into discovery calls.

---

## Creative Concept: "The Machine That Thinks"

The site should feel like precision engineering — clean, structured, systematic — but with moments of intelligence and warmth that reveal the human side. Think: the clarity of a well-organized dashboard meets the confidence of a company that builds systems for a living. The site itself should feel like something Ventok would build: reliable, thoughtful, no bullshit.

**Signature moment:** the service tier progression (Infrastructure → Automation → AI) visualized as an interactive journey — scroll through and watch a simple spreadsheet evolve into a thinking system. Each tier builds on the last.

---

## Visual Direction

### Aesthetic
- **Clean but not sterile.** Structured layouts with subtle organic warmth
- **Dark mode primary.** Deep background (#0C0F14 — dark navy-black), light text, one vivid accent
- **Monochrome + one accent.** 90% neutrals, 10% accent. The accent appears on CTAs, active states, and key data points
- **Technical precision.** Grid-aligned, consistent spacing, nothing arbitrary — this is a company that builds systems, the site should FEEL systematic
- **Estonian soul.** Subtle Nordic minimalism — not Scandinavian-light, more Baltic-dark. Forest tones as secondary warmth

### Color Palette
```
Background:      #0C0F14 (deep navy-black)
Surface:         #141820 (elevated panels)
Card:            #1A1F28 (cards, sections)
Border:          #2A3040 (subtle borders)
Text primary:    #E8ECF2 (light, high contrast)
Text secondary:  #8892A0 (muted descriptions)
Text muted:      #5A6170 (labels, metadata)
Accent:          #3B82F6 → NO — too generic
Accent:          #22D68A (confident green — "systems running")
                 or #4AEDC4 (mint — technical, fresh)
                 or #F97316 (orange — energetic, stands out on dark)
Pick ONE. Use it sparingly: CTAs, active nav, key metrics, hover states.
White:           #FFFFFF (headings, emphasis only)
```

**Alternative — light mode:**
If dark feels wrong for the Estonian SME market:
```
Background:      #FAFBFC
Surface:         #FFFFFF  
Text:            #111827
Secondary:       #6B7280
Accent:          #059669 (professional green)
```

### Typography
**Display/Headlines:**
- Font: Söhne, Geist, or Inter Display (clean, modern, technical without being cold)
- Weight: 500-600 at large sizes
- Size: hero at 56-80px desktop (clamp for fluid)
- Tracking: -0.02em

**Body:**
- Font: Inter or IBM Plex Sans (readable, professional)
- Size: 17-18px
- Line-height: 1.65
- Color: secondary text color, not pure white

**Monospace accents (for the technical feeling):**
- Font: JetBrains Mono or IBM Plex Mono
- Used for: section labels, service tier numbers, technical terms, process steps
- Uppercase, tracked out (+0.08em), 11-12px
- This is the detail that signals "we're technical people"

**Estonian characters:** ensure the font supports: ä, ö, ü, õ, š, ž

---

## Page Structure

### Navigation
- Fixed top, transparent over hero, solid with blur on scroll
- Logo left: "ventok" in lowercase, clean wordmark
- Links center or right: Services, About, Book a call (CTA button)
- Language toggle: EN / ET — small, subtle, in nav
- Mobile: hamburger → full-screen overlay with large nav links

### Hero Section (100vh)
- Headline: **"build the backbone. then make it think."** — displayed as 3 lines, each appearing with stagger animation
- Subtext: "Infrastructure. Automation. Intelligence. Built around how your business actually runs."
- CTA: "Book a call" button (accent color, solid)
- Secondary: "scroll to explore" with animated arrow/chevron
- Background: subtle animated grid or node network (very understated — not distracting)
- NO stock images. NO illustrations of gears or robots.

### Social Proof Strip
- Client logos in grayscale: Noar, Menufilmid, Termovesi, + any others
- Or: "Trusted by Estonian businesses" with subtle logo row
- Small, between hero and main content

### About / Problem Section
- Headline: "from spreadsheet chaos to systems that think."
- 2-3 short paragraphs explaining the pain point and the solution
- Keep it real: "no off-the-shelf software that almost fits"
- Visual: before/after — messy spreadsheet view vs clean dashboard (illustrated or abstracted)

### Services Section (KEY SECTION — make this excellent)
The tier progression is the core differentiator. Display as a journey:

**Option A: Sticky scroll**
- Left side: service tier sticky (stays visible)
- Right side: content scrolls through each tier
- Each tier: icon/visual + title + description + key deliverables

**Option B: Horizontal tabs/steps**  
- 4 tabs across: Infrastructure → Automation → AI → Audit
- Each tab reveals content below
- Progress indicator connecting the tabs shows the journey

**Option C: Vertical progression**
- Each tier is a full-width section
- Connected by a visual "thread" or line
- Numbers: 01, 02, 03, 04 in monospace
- Each tier builds on the last visually (gets more complex/animated)

Services:
1. **Business Infrastructure** — CRM, project management, knowledge systems
2. **Process Automation** — connect tools, kill copy-paste, data flows
3. **AI-Augmented Workflows** — classification, extraction, drafting with guardrails
4. **Process Audit** — map operations, find bottlenecks, prioritize
5. **Web Design** — connected to your systems (brief mention, not a lead service)

### Growth Journey Section
"How businesses grow with us" — 4 steps showing the progression:
Start with infrastructure → Add automation → Layer intelligence → Scale with confidence

Visual: timeline or step progression, each step building on the last. Not just text — show it with growing complexity in the visual treatment.

### Testimonials
- 3 client quotes, displayed one at a time (carousel or scroll)
- Real names, real companies, real quotes
- Keep it personal and specific (the Noar quote about "actually uses" is perfect)

### Trust Builders
- "Real hours saved, not impressive-sounding automation"
- "Built with guardrails" — confidence scoring, human checkpoints
- "We grow with you" — long-term partnership model
- Display as 3-4 value cards with monospace numbers (01, 02, 03, 04)

### CTA Section
- Full-width dark/contrast section
- Headline: "Still doing it manually?"
- Subtext: brief, one line
- Button: "Book a call" — primary accent color
- Secondary: email address as text link

### FAQ
- Expandable accordion, clean
- Grouped by category: General, AI-Specific, Process, Pricing
- Estonian SEO value — these should be comprehensive

### Footer
- Logo, tagline
- Nav links repeated
- Contact: email, phone (if applicable)
- Location: Tallinn, Estonia
- Language toggle
- Social links (if any)
- Legal: privacy policy, terms

---

## Animation & Interaction

### Baseline
- Smooth scroll (Lenis)
- Scroll-triggered reveals: fade + translateY(20px), 400-600ms, staggered
- Hover states on all interactive elements
- Nav background blur transition on scroll

### Service Tier Progression
This is where the animation budget goes:
- Scroll-linked progression through the 4 tiers
- Each tier "activates" as you reach it — visual indicator, content reveal
- The connection between tiers is animated (line drawing, progress fill)
- This section should feel like watching a system come alive

### Hero
- Headline text staggers in word by word (50ms per word)
- Subtle background animation (grid nodes connecting, or gentle particle flow)
- CTA fades in slightly after headline completes

### Hover
- Buttons: subtle scale (1.02) + shadow increase
- Cards: border highlight or background lighten
- Links: underline animation (width from 0 to 100%)
- Service cards: accent color border or glow appears

### Page Load
- No heavy preloader — fast FCP
- Elements reveal progressively as they enter viewport
- No FOUC (flash of unstyled content)

---

## Responsive

- **Desktop-first design** (the audience is business owners on laptops)
- **Breakpoints:** 1280px, 1024px, 768px, 640px
- **Mobile:** stack all columns, increase touch targets to 48px, simplify service section to vertical cards
- **Tablet:** 2-column grids where desktop has 3-4

---

## Content Notes

- **Tone:** direct, no-nonsense, slightly technical but never jargon-heavy. "We build" not "we leverage synergies"
- **Bilingual:** full Estonian + English. Not machine-translated — both languages should feel native
- **CTA is always "Book a call"** — not "Get started" or "Sign up"
- **Estonian market context:** mention EIS grants, GDPR compliance, local references
- **NO stock photos.** Use abstract visuals, data visualizations, UI mockups, or nothing at all. Real photos only if they're actual Ventok/client work

---

## What This Site Must NOT Be

- A generic SaaS landing page with blue accents
- A template that looks like every other agency site
- A site that leads with "we're a full-service digital agency"
- Cluttered with features, services, and information above the fold
- Built with stock illustrations of people high-fiving around a laptop
- Slow to load (no heavy 3D, no unnecessary video)
- Light mode with gray cards and blue buttons (the default AI output)

## What This Site Must Feel Like

- Walking into a well-organized workspace where everything has its place
- Confidence without arrogance
- Technical competence made approachable
- A company that practices what it preaches — the site IS a well-built system
- Baltic, not Silicon Valley
