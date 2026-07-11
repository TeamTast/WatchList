# Personal Web Design Direction

> Version 1.0 — aligned 2026-07-11
> This document is normative. `MUST`, `SHOULD`, and `NEVER` indicate implementation priority.

## 0. Purpose

This file defines the default visual and interaction language for websites built for this user.
It is a reusable design core with separate profiles for product/technology landing pages,
information-dense web applications, and editorial/portfolio sites.

The goal is not to reproduce a reference website. The goal is to make a new site feel deliberate,
operational, technically literate, and immediately recognizable—without looking like a generic
AI-generated SaaS template.

When the project brief does not specify a visual direction, use this file as the default.
Do not ask the user to choose routine styling details that are already decided here.

---

## 1. North Star

### One-sentence direction

**A mission-critical industrial interface with editorial typography, restrained technical diagrams,
and one meaningful code-generated interaction—practical first, cinematic second.**

### Calibration mix

- 45% operational technology / command-and-control utility
- 25% industrial editorial and Swiss-influenced typography
- 15% code-native generative interaction
- 10% technical diagram and data-visualization language
- 5% subtle speculative/sacred sci-fi undertone

These percentages describe perceived character, not literal screen area.

### Reference hierarchy

1. **Primary — Anduril:** overall confidence, industrial technology, typography, product presentation,
   text entrances, and the balance of utility with spectacle.
2. **Secondary — Palantir:** borrow information hierarchy and system clarity only. Do not reproduce
   long, tiring, scroll-led storytelling.
3. **Accent — DIA / Space Type Generator:** use generative type or particle behavior as a rare
   signature moment, never as the base UI language.
4. **Texture — N・O・D・E and technical zines:** borrow directness, labels, diagrams, and a human-made
   tool quality that prevents over-polished SaaS sameness.

Reference links:

- https://www.anduril.com/
- https://www.palantir.com/platforms/gotham/
- https://www.dia.studio/work/nuits-sonores
- https://spacetypegenerator.com/
- https://n-o-d-e.net/zine/

Use references for principles. **Never copy logos, proprietary assets, exact layouts, or brand marks.**

---

## 2. Decision Priority

When goals conflict, decide in this order:

1. Core task completion and legibility
2. Accessibility and input freedom
3. Clear information hierarchy
4. Cohesive industrial identity
5. Responsive behavior
6. Motion and generative spectacle

Visual drama may bend a layout, but it must not make the primary action ambiguous or delay access
to content.

---

## 3. Non-negotiable Design Principles

### 3.1 Operational clarity

Every screen should look usable, not merely cinematic. The viewer should quickly understand:

- where they are;
- what the system is showing;
- what changed;
- what action is available next.

Use status, timestamps, section IDs, direct labels, and visible state changes. Decorative complexity
must sit behind a simple task model.

### 3.2 Controlled asymmetry

Use a strict grid, then break it intentionally once or twice per viewport. Prefer offset titles,
unequal columns, edge-anchored metadata, and large/small scale contrast over arbitrary misalignment.

The result should feel engineered, not shuffled.

### 3.3 Generated before sourced

When a hero or atmospheric visual is needed, prefer a semantic SVG, Canvas, CSS, or WebGL system
over a stock image. The generated visual should react to the subject, data, time, pointer, or scroll
position. Random particles alone are not a concept.

### 3.4 Quietly alive

At rest, the interface may show restrained signs of operation: a clock, updating values, a scanning
line, shifting topology, or a status pulse. Most of the screen remains stable. Nothing should blink
or move merely to prove that JavaScript is running.

### 3.5 Dark comfort

Dark mode is the default because it is easier on the eyes. Avoid the glare of pure black against
pure white across large regions. Use charcoal surfaces and soft off-white text.

### 3.6 Motion without captivity

Motion should reward attention, not hold the user hostage. Text entrances may be expressive;
navigation and reading must remain immediate.

### 3.7 Arknights DNA, not Arknights costume

Abstract the useful DNA: numbering, editorial scale contrast, technical annotation, industrial
precision, and a faint sacred/sci-fi tension. Do not imitate game screens, factions, iconography,
or lore. Symbolic circles, crosshairs, or axial forms may appear sparingly and only when the project
can support them.

---

## 4. Hard Prohibitions

### 4.1 Never hijack scrolling

The page MUST preserve native browser scrolling.

NEVER:

- intercept wheel or touch input to advance a narrative;
- pause the user's scroll until an animation finishes;
- change scroll speed or add inertial/smoothed scrolling libraries by default;
- use full-page mandatory scroll snapping;
- pin a full-screen scene while many scroll steps drive a timeline;
- lock `body` overflow for a marketing sequence;
- require the user to scrub through a video-like section to reach content;
- use GSAP ScrollTrigger pinning, Lenis-style global smoothing, or equivalent patterns for page flow.

Sticky positioning is acceptable for functional navigation, table headers, filters, or a small
context rail. It is not acceptable as a long-form cinematic trap.

Scroll-triggered effects MUST be non-blocking, skippable, and complete even if the user scrolls past
quickly. Content must remain available when JavaScript or animation is disabled.

### 4.2 Avoid generic AI/SaaS styling

NEVER default to:

- blue-purple gradients;
- gradient text;
- glassmorphism;
- glowing orbs or aurora blobs;
- large rounded cards floating in excessive whitespace;
- repeated three-card feature rows;
- centered hero copy above a generic dashboard mockup;
- pill-shaped controls everywhere;
- soft, oversized shadows;
- meaningless abstract icons inside colored circles;
- decorative grids, QR codes, or coordinates with no relationship to content;
- an off-the-shelf component library appearance with only colors changed.

### 4.3 Avoid visual cosplay

Do not add fake military labels, random warnings, crosshairs, barcodes, or classification stamps to
every component. One coherent annotation system is stronger than ten unrelated tactical clichés.

---

## 5. Theme and Color

### 5.1 Default dark theme

Use these as starting tokens, adjusting only when project branding requires it.

```css
:root {
  --bg-canvas: #0a0c0d;
  --bg-surface-1: #101416;
  --bg-surface-2: #171c1f;
  --bg-interactive: #20272b;

  --text-primary: #eef1ef;
  --text-secondary: #b7bfbc;
  --text-muted: #77817d;
  --text-inverse: #0b0e0f;

  --line-subtle: #283034;
  --line-default: #364045;
  --line-strong: #556166;

  --signal-action: #ff5a3c;
  --signal-positive: #72d9bd;
  --signal-caution: #e9b85c;
  --signal-info: #79a9ff;
  --signal-danger: #ff4d4f;
}
```

Rules:

- Keep roughly 85% of the interface neutral.
- Use one dominant signal color per screen.
- Red-orange is the default action/attention color, not a background decoration.
- Teal is primarily semantic: positive, online, rising, or confirmed.
- Never use color as the only carrier of state.
- Large text areas should use `--text-primary`, not pure `#fff`.

### 5.2 Official inverse theme: concrete light

This is a complete alternate material language, not a simple white-mode inversion.

```css
[data-theme="light"] {
  --bg-canvas: #d7d8d4;
  --bg-surface-1: #e4e5e0;
  --bg-surface-2: #f0f0eb;
  --bg-interactive: #c9ccc7;

  --text-primary: #101415;
  --text-secondary: #4d5653;
  --text-muted: #555e5a;
  --text-inverse: #f1f2ee;

  --line-subtle: #bec2bc;
  --line-default: #aeb4ae;
  --line-strong: #747d79;
}
```

The light theme should evoke concrete, drafting paper, industrial printing, and cool daylight.
A generated monochrome noise texture is acceptable below 2.5% opacity if it never reduces text
contrast.

---

## 6. Typography

### 6.1 Font roles

Prefer open, self-hostable typefaces.

```css
:root {
  --font-display: "Barlow Condensed", "Arial Narrow", "IBM Plex Sans JP", sans-serif;
  --font-ui: "IBM Plex Sans JP", "Noto Sans JP", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
}
```

- **Display:** large headings, section numbers, compressed statements.
- **UI:** navigation, paragraphs, controls, and Japanese text.
- **Mono:** values, timestamps, identifiers, tickers, coordinates, and compact metadata.

If these fonts are unavailable, preserve the role contrast rather than silently using one font for
everything.

### 6.2 Scale and hierarchy

```css
:root {
  --text-micro: 0.6875rem;
  --text-label: 0.75rem;
  --text-ui: 0.875rem;
  --text-body: 1rem;
  --text-lead: clamp(1.125rem, 1.4vw, 1.5rem);
  --text-section: clamp(2rem, 3.8vw, 4.25rem);
  --text-display: clamp(3.5rem, 8vw, 8.5rem);
}
```

- Use extreme scale contrast: a very large statement beside tiny, legible metadata.
- Default application UI text may be 14px; reading text should remain 16px or larger.
- Use tabular numerals for changing values.
- Use uppercase English labels sparingly; do not force uppercase behavior onto Japanese copy.
- Keep display line-height around `0.9–1.02`, body around `1.55–1.75` for Japanese.
- Avoid wide letter spacing in Japanese.
- Do not animate paragraph text character by character.

### 6.3 Text entrance signature

Text entrances are a signature behavior inspired by the strength of Anduril's motion language.

Preferred pattern:

1. Place each heading line in an `overflow: hidden` wrapper.
2. Reveal line-by-line from `translateY(105%)` to `translateY(0)`.
3. Use little or no blur.
4. Stagger lines by 35–70ms.
5. Reveal the eyebrow/ID just before the title and supporting copy just after it.
6. Keep the final text in the DOM and accessible before animation begins.

Suggested timing:

```css
--motion-instant: 100ms;
--motion-fast: 160ms;
--motion-base: 220ms;
--motion-reveal: 420ms;
--ease-hard-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-linear: linear;
```

The reveal must never delay reading by more than about 500ms. Avoid typewriter effects for primary
headings; they feel slow and artificial. A short decode/scramble effect is acceptable only for a
small machine label or transient status.

---

## 7. Layout System

### 7.1 Desktop-first grid

Design the full composition first at 1440–1600px.

```css
:root {
  --grid-columns: 12;
  --page-gutter: clamp(20px, 2.6vw, 48px);
  --grid-gap: clamp(12px, 1.25vw, 24px);
  --content-max: 1760px;
  --space-unit: 4px;
}
```

- Use a 12-column grid for desktop and a 4-column grid for mobile.
- Prefer edge-anchored composition over a centered floating page.
- Typical hero splits are 7/5 or 8/4, not symmetrical 6/6 by default.
- Align data, controls, diagrams, and annotations to shared grid lines.
- Allow one or two deliberate grid violations for emphasis.
- Do not create giant empty vertical gaps merely to feel premium.

### 7.2 Density

- Applications should be compact and information-rich.
- Landing pages may breathe more, but sections should still contain a clear informational payload.
- Use whitespace to separate modes or priorities, not as decoration.
- Prefer several meaningful alignment lines over many floating boxes.

### 7.3 Shape language

- Default corner radius: `0–3px`.
- Reserve a cut corner or clipped edge for selected primary panels and actions.
- Use 1px borders and surface contrast instead of shadows.
- Overlays may use one restrained deep shadow; normal panels should not.
- Hairlines, brackets, ticks, and small rules are preferred over ornamental frames.

### 7.4 Technical annotation

Use section codes, timestamps, axis labels, revision numbers, coordinates, and connector lines only
when they describe real structure or reinforce navigation.

- Limit long connector lines to roughly 5–8 visible instances per desktop viewport.
- Reduce or remove them on mobile.
- Give annotations a consistent syntax, for example `SYS/03`, `REV.02`, `UTC+09`, `NODE-17`.
- Never let microtype become essential instructions.

---

## 8. Code-native Generative Visuals

### 8.1 Role

Generated visuals replace generic hero photography and stock illustration. They should make the
site feel like a system that belongs to its subject.

Good sources of behavior:

- project data or real-time values;
- content topology and relationships;
- pointer position within a local region;
- time, latency, frequency, rhythm, or progress;
- seeded randomness tied to a stable identifier;
- geometry derived from a product, map, network, or process.

Good visual families:

- topographic contours;
- vector fields and flow lines;
- node graphs and routing paths;
- schematic wireframes;
- scan bands and sampling grids;
- particles that temporarily form letters or symbols;
- generative typographic fields;
- waveform, radar, or telemetry abstractions based on actual content.

### 8.2 Implementation priority

Choose the simplest technology that can deliver the concept:

1. CSS for small geometric or typographic behavior
2. SVG for diagrams, paths, masks, and accessible structure
3. Canvas 2D for larger fields and particles
4. WebGL only when real depth, shader behavior, or element count justifies it

Do not add a 3D dependency for a visual that could be a 20-line SVG.

### 8.3 Interaction rules

- A landing page may have **one primary generative scene** and small functional diagrams elsewhere.
- An application should keep generative visuals subordinate to data and controls.
- Pointer interaction should influence a local field, not make the whole page chase the cursor.
- Scroll may adjust a visual parameter but must never control navigation or block progress.
- Use seeded randomness so the composition feels authored and remains stable between renders.
- Pause offscreen animations and when the tab is hidden.
- Cap device pixel ratio when necessary; a beautiful laptop fan is not a design feature.
- Provide a static SVG or CSS fallback.
- Under `prefers-reduced-motion`, show the final composed state immediately.

### 8.4 Avoid

- generic particle galaxies;
- neon metaballs and liquid blobs;
- cursor followers with no function;
- constant high-amplitude noise;
- visuals whose only concept is “futuristic”;
- placing readable information only inside Canvas/WebGL.

---

## 9. Motion System

### 9.1 Character

Motion is short, hard, and controlled. It should resemble a system acquiring state rather than a
soft lifestyle app floating into place.

- Press/selection response: 100–160ms
- Normal UI transition: 160–240ms
- Heading reveal: 320–480ms
- Section entrance: 260–520ms
- Ambient loops: 6–18s, low amplitude

Prefer transforms, clipping, line wipes, counters, border acquisition, and small tracking shifts.
Avoid bouncy springs, floaty overshoot, blur-heavy fades, and elastic easing.

### 9.2 Entrance hierarchy

For an important section:

1. system label / section ID;
2. rule or boundary line;
3. heading reveal;
4. supporting copy and primary control;
5. optional diagram response.

The sequence may overlap and should finish quickly. Never animate every child element independently.

### 9.3 Ambient activity

Use at most two subtle ambient behaviors in one viewport, for example:

- a timestamp updating;
- a slow scan line;
- a low-amplitude vector field;
- a status dot with a long, quiet cadence;
- a graph receiving a new data point.

Ambient motion stops or simplifies when the page is not active.

---

## 10. Component Language

### 10.1 Header and navigation

- Keep the desktop header between roughly 48–64px tall.
- Anchor it to page edges or the grid; do not place it in a floating rounded capsule.
- Combine a clear wordmark/title with small system metadata or section index.
- Use visible current-location state.
- Mobile navigation may become a full-height panel, but it must open instantly and preserve focus.

### 10.2 Hero

- Default to left or edge alignment, not centered symmetry.
- Pair one large statement with compact supporting data, labels, or a generated visual.
- The primary action should be obvious within the first viewport.
- Avoid giant decorative copy that forces the actual value proposition below the fold.
- Landing-page motion may be strong, but scrolling remains completely native.

### 10.3 Panels, not cards

Treat containers as instrument panels, records, sections, or modules.

- Use a header strip, ID, status, or divider to give each panel a role.
- Prefer shared borders and aligned edges over isolated floating cards.
- Use surface elevation sparingly.
- Avoid repeating identical rounded rectangles.

### 10.4 Buttons and links

- Default shape: rectangular, 0–3px radius, 36–44px height.
- Primary action: solid off-white or signal color with dark text.
- Secondary action: border or text link with a directional arrow.
- Hover: border/foreground change and a 2–5px arrow translation.
- Active state should feel immediate and mechanical.
- Pills are reserved for truly compact status or filtering needs, not ordinary actions.

### 10.5 Status tags

- Use compact rectangular tags with tabular/mono text.
- Combine color with text, icon, or pattern.
- Examples: `ONLINE`, `DELAYED`, `REV.03`, `+4.21%`, `SYNC 18ms`.

### 10.6 Forms

- Use visible labels; placeholders are examples, not labels.
- Inputs are rectangular with clear resting, hover, focus, error, and disabled states.
- Keep density high but touch targets safe.
- Validation messages should be direct and located next to the relevant field.

### 10.7 Tables and live data

- Use tabular numerals and align numbers by decimal or end edge.
- Sticky table headers are encouraged when functional.
- Distinguish selected, changed, delayed, and stale states.
- Animate value changes briefly without moving the row layout.
- Avoid turning every row into a separate card on desktop.

### 10.8 Charts and diagrams

- Use direct labels where possible.
- Keep gridlines subtle and axes legible.
- Reserve signal colors for meaning, not decoration.
- Provide exact values in tooltips or adjacent data.
- Do not make red/green the only distinction.

### 10.9 Icons

- Prefer simple geometric, industrial, or diagrammatic icons with consistent stroke weight.
- Pair unfamiliar icons with text.
- Avoid a page full of generic outline icons in circular badges.
- Do not mix several icon libraries.

---

## 11. Imagery Policy

Images are optional and never the automatic answer.

When imagery genuinely adds value:

- use few images at high impact;
- crop decisively;
- consider grayscale or controlled duotone treatment;
- integrate captions, coordinates, or real metadata;
- align images to the structural grid;
- avoid glossy stock imagery and AI-looking abstract renders.

By profile:

- **Landing page:** one strong image or generated scene may lead the composition.
- **Application:** prioritize data, diagrams, and generated functional visuals.
- **Editorial/portfolio:** controlled collage is allowed, but typography remains the organizing force.

---

## 12. Responsive Strategy

Desktop is the primary canvas; mobile is an intentional adaptation, not a shrunken screenshot.

### Desktop

- Target the complete composition at 1440–1600px first.
- Use the full 12-column grid and richest generative behavior.
- Support wide screens up to the content maximum without stretching reading lines.

### Tablet

- Collapse to 8 or 6 logical columns.
- Remove secondary annotations before reducing important text.
- Keep primary data and actions visible.

### Mobile

- Use a 4-column grid and 16–20px gutters.
- Preserve the primary typographic contrast, one signature motif, and clear status language.
- Remove long connector lines, decorative coordinates, and secondary ambient loops.
- Stack panels by task priority, not desktop left-to-right order.
- Tables may scroll horizontally or switch to a purpose-designed compact row view.
- Never depend on hover.
- Minimum touch target: 44×44px where touch is expected.
- Keep the experience fast; static composition is better than a stuttering WebGL scene.

---

## 13. Content and Voice

Copy should sound precise, direct, and technically aware.

Prefer:

- short declarative headings;
- concrete nouns and active verbs;
- real units, timestamps, and state labels;
- compact supporting copy;
- meaningful section names.

Avoid generic AI marketing phrases such as:

- “Unlock your potential”
- “Reimagine the future”
- “Seamless experiences”
- “Powerful, intuitive, and beautiful”
- “Next-generation solution” without evidence

If the project lacks copy, write specific provisional copy tied to the actual product. Do not use
`Lorem ipsum` in a final implementation.

---

## 14. Accessibility and Performance

### Accessibility

- Meet WCAG AA contrast for text and interactive controls.
- Provide a clear 2px keyboard focus treatment.
- Keep DOM reading order logical even when the visual layout is asymmetric.
- Use semantic headings and landmarks.
- Add a skip link on content-heavy pages.
- Do not put essential text only in generated graphics.
- Do not communicate state through color alone.
- Respect `prefers-reduced-motion` and reveal content immediately.
- Respect `prefers-contrast` when practical.

### Performance

- Prefer CSS/SVG over Canvas/WebGL when the result is equivalent.
- Load generative systems after critical content when possible.
- Pause offscreen and hidden-tab animation.
- Avoid continuous layout reads/writes in animation loops.
- Use transforms and opacity for UI motion.
- Test on an ordinary laptop and a mid-range phone, not only a development desktop.
- A generated visual must degrade gracefully rather than block the page.

---

## 15. Usage Profiles

Select exactly one primary profile before designing. A project may borrow from another profile, but
it should not mix all three at equal strength.

### Profile A — Operations / Data Application

Use for dashboards, market monitoring, collaborative tools, admin systems, and live data.

- Highest information density
- Function-first panels and tables
- Compact 14px UI scale
- Subtle ambient status only
- Generated visuals tied to real data
- Strong keyboard/focus behavior
- Minimal hero treatment
- Asymmetry used for priority, not spectacle

### Profile B — Product / Technology Landing Page

Use for products, game projects, technology demonstrations, and launches.

- Strongest typography and text entrances
- One primary code-generated hero scene
- More expressive asymmetry
- Clear product evidence in every section
- Native, unmodified scrolling
- No pinned cinematic chapters
- A/B-style generative type is allowed once as a high-impact accent

### Profile C — Editorial / Portfolio

Use for essays, case studies, project archives, and personal work.

- Typography-led storytelling
- Dark default or concrete-light inverse
- Controlled collage when real imagery exists
- Strong index, captions, dates, and revision language
- Generative transitions or diagrams between ideas
- Comfortable reading width and line-height

---

## 16. Agent Execution Protocol

When building a site from this document, follow this sequence:

1. **Identify the primary profile.** Infer it from the project; ask only if the choice would change
   the product fundamentally.
2. **Name the primary task and primary action.** Visual hierarchy follows these, not decoration.
3. **Inventory the real content and states.** Include loading, empty, error, success, delayed, and
   disabled states where relevant.
4. **Establish tokens and grid before components.** Use the dark theme unless the brief explicitly
   calls for the concrete-light inverse.
5. **Choose one project-specific generative rule.** Write one sentence explaining what drives it.
   If no meaningful rule exists, use a restrained technical diagram instead.
6. **Design the desktop composition.** Verify hierarchy at 1440×900 before adding flourish.
7. **Add motion.** Use the text-reveal signature and short mechanical interaction states.
8. **Adapt intentionally to mobile.** Remove secondary decoration; preserve identity and task flow.
9. **Run the prohibition audit.** Remove generic SaaS styling and all scroll interference.
10. **Render and inspect.** Check the real page visually at desktop and mobile sizes.

The agent should implement a cohesive first version, not stop after producing a moodboard or a list
of suggestions.

---

## 17. Final Acceptance Checklist

Before presenting the site, confirm all of the following:

### Identity

- [ ] The result feels industrial, editorial, and operational—not like a default SaaS template.
- [ ] Anduril-like confidence is present without copying Anduril.
- [ ] Arknights influence is abstract and subtle rather than literal.
- [ ] There is one memorable, project-specific visual idea.

### Function

- [ ] The primary action is obvious in the first viewport.
- [ ] Information hierarchy is understandable without animation.
- [ ] Real states and interactions are designed, not only the happy-path screenshot.
- [ ] Dense screens remain scan-friendly.

### Motion

- [ ] Important headings use a fast, clipped line reveal where appropriate.
- [ ] No animation delays access to essential content.
- [ ] Native scrolling is untouched.
- [ ] There is no wheel interception, global smooth scrolling, mandatory snap, or pinned narrative.
- [ ] Reduced-motion mode shows the final state immediately.

### Visual system

- [ ] Dark charcoal, not pure black, is the default canvas.
- [ ] Signal colors have semantic meaning.
- [ ] Corners, borders, type roles, and spacing are consistent.
- [ ] Rounded cards, purple gradients, glass, glow blobs, and icon bubbles are absent.
- [ ] Annotations and technical markings have a consistent logic.

### Responsive and quality

- [ ] The desktop composition is intentionally designed at 1440–1600px.
- [ ] Mobile preserves hierarchy and identity without simply shrinking desktop.
- [ ] Keyboard focus, contrast, and touch targets are usable.
- [ ] Generated visuals pause, degrade gracefully, and do not obscure information.
- [ ] The implementation has been visually inspected at both desktop and mobile sizes.

---

## 18. Short Prompt Capsule

Use this only when a tool accepts a short visual-direction prompt instead of this entire file:

> Build a desktop-first industrial technology interface with Anduril-like confidence, operational
> clarity, controlled asymmetry, extreme typographic scale contrast, charcoal surfaces, thin
> technical rules, compact mono metadata, and red-orange semantic accents. Prefer one meaningful
> SVG/Canvas/WebGL visual derived from the project's data or concept instead of stock imagery.
> Use fast clipped line-by-line heading reveals and restrained ambient system activity. Keep native
> scrolling completely untouched: no scroll hijacking, smoothing, mandatory snapping, pinning, or
> animation gates. Avoid generic AI/SaaS styling—no blue-purple gradients, glassmorphism, glowing
> orbs, rounded floating cards, excessive whitespace, or icon bubbles. Preserve utility first, then
> add spectacle. Adapt intentionally to mobile by removing secondary decoration while keeping the
> hierarchy and identity.
