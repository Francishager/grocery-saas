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
  if (inner && contents > 0 && normalizeUnit(unitName) === normalizeUnit(inner)) {
    return `1 ${base} = ${formatQuantity(contents)} ${inner}`
  }
  return `1 ${unitName} = ${formatQuantity(conversionFactor)} ${base}`
}
