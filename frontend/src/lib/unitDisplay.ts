const normalizeUnit = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ').replace(/s$/, '')

const formatQuantity = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value)

export function sellingUnitConversionLabel(
  unitName: string,
  conversionFactor: number,
  baseUnit?: string | null,
  contentsUnit?: string | null,
  contentsPerBaseUnit?: number | null,
): string {
  const base = baseUnit?.trim() || 'base unit'
  const inner = contentsUnit?.trim() || ''
  const contents = Number(contentsPerBaseUnit || 0)
  const normalizedName = normalizeUnit(unitName)
  const normalizedInner = normalizeUnit(inner)
  if (inner && contents > 0) {
    if (normalizedName === normalizedInner) return `1 ${base} = ${formatQuantity(contents)} ${inner}`
    if (normalizedName === `half ${normalizedInner}`) return `1 ${unitName} = 0.5 ${inner}`
    if (normalizedName === `quarter ${normalizedInner}`) return `1 ${unitName} = 0.25 ${inner}`
  }
  return `1 ${unitName} = ${formatQuantity(conversionFactor)} ${base}`
}
