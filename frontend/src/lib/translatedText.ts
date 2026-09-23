export type TranslatedText = { source: string; rendered: string }

// Reuse the source only while the DOM still contains our own last translation.
// React may have replaced it with a new amount, label, or customer value.
export function translatedText(
  current: string,
  previous: TranslatedText | undefined,
  lookup: (key: string) => string,
): TranslatedText {
  const source = previous?.rendered === current ? previous.source : current
  const key = source.trim()
  const translation = key ? lookup(key) : key
  const rendered = translation === key ? source : source.replace(key, () => translation)
  return { source, rendered }
}
