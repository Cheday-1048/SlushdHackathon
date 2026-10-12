/*
 * Accent presets, sampled from docs/design-references/palettes/.
 * The actual color values live in appearance.css (html[data-accent='…']); this list only
 * names them for UI and gives a swatch color. Add a preset by adding a CSS block and an entry here.
 */
export const accentPresets = [
  { id: 'cyan', label: 'Cyan', swatch: 'var(--cyan-700)' },
  { id: 'teal', label: 'Teal', swatch: 'var(--teal-600)' },
  { id: 'periwinkle', label: 'Periwinkle', swatch: 'var(--indigo-600)' },
  { id: 'lavender', label: 'Lavender', swatch: 'var(--lavender-500)' },
] as const

export type AccentId = (typeof accentPresets)[number]['id']
export const DEFAULT_ACCENT: AccentId = 'cyan'
