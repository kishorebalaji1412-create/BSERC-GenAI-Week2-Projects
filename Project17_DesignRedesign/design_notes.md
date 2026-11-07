# TECHNOVA 2026 redesign notes

- `before.html` is the unstyled baseline: no stylesheet, style attributes, or CSS; it uses the browser's default HTML presentation.
- `after.html` keeps the baseline's body content, words, element order, and element nesting. The visual redesign is applied through classes-by-selector in the document head, with no added or removed body copy.
- The visual system uses a near-black green-blue canvas, lime and cyan accents, subtle radial glows, translucent glass panels, restrained borders, and soft shadows.
- Outfit provides expressive display and interface typography; DM Mono differentiates metadata, times, and labels. System sans-serif fallbacks remain in place if Google Fonts cannot load.
- CSS Grid lays out the hero, highlight cards, cafe vendors, and registration area. The schedule remains a semantic HTML table and scrolls horizontally on narrow screens.
- Hover/focus transitions provide restrained micro-interactions. A reduced-motion media query limits animation for users who prefer less motion.
- The registration form uses native labels, appropriate input types, required-field validation, and no added JavaScript or backend behavior.
