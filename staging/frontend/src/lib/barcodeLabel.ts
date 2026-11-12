const leftPatterns = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
]
const alternatePatterns = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
]
const parityByFirstDigit = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
]

export function generateInternalEan13Barcode(): string {
  const randomValues = new Uint32Array(10)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(randomValues)
  else randomValues.set(Array.from({ length: 10 }, () => Math.floor(Math.random() * 0xffffffff)))
  const payload = `20${Array.from(randomValues, value => String(value % 10)).join('')}`
  const sum = [...payload].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return `${payload}${(10 - (sum % 10)) % 10}`
}

const isValidEan13 = (value: string) => {
  if (!/^\d{13}$/.test(value)) return false
  const sum = [...value.slice(0, 12)].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  )
  return (10 - (sum % 10)) % 10 === Number(value[12])
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character))

const renderEan13Svg = (barcode: string) => {
  if (!isValidEan13(barcode)) throw new Error('This barcode is not a valid EAN-13 code.')

  const digits = [...barcode].map(Number)
  const parity = parityByFirstDigit[digits[0]]
  let bars = '101'
  for (let index = 1; index <= 6; index += 1) {
    const digit = digits[index]
    bars += parity[index - 1] === 'L' ? leftPatterns[digit] : alternatePatterns[digit]
  }
  bars += '01010'
  for (let index = 7; index <= 12; index += 1) {
    bars += [...leftPatterns[digits[index]]].map(bit => bit === '1' ? '0' : '1').join('')
  }
  bars += '101'

  const quietZone = 11
  const rects = [...bars].flatMap((bit, index) => bit === '1'
    ? [`<rect x="${quietZone + index}" y="0" width="1" height="${index < 3 || (index >= 45 && index < 50) || index >= 92 ? 58 : 50}"/>`]
    : []).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 117 76" role="img" aria-label="Barcode ${barcode}" shape-rendering="crispEdges"><g fill="#111">${rects}</g><text x="58.5" y="72" text-anchor="middle" font-family="Arial,sans-serif" font-size="8">${barcode}</text></svg>`
}

export function printProductBarcode(product: {
  name: string
  barcode?: string | null
  size?: string | null
  brand?: string | null
  design?: string | null
}): boolean {
  const barcode = String(product.barcode || '').trim()
  if (!barcode) return false
  const barcodeSvg = renderEan13Svg(barcode)

  const printWindow = window.open('', '_blank', 'width=480,height=360')
  if (!printWindow) return false

  const details = [product.brand, product.size, product.design].filter(Boolean).join(' · ')
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcode label</title><style>
    @page { size: 50mm 30mm; margin: 2mm; }
    * { box-sizing: border-box; }
    body { width: 46mm; margin: 0; color: #111; font-family: Arial, sans-serif; text-align: center; }
    .name { margin: 0 0 1mm; font-size: 10pt; font-weight: 700; overflow-wrap: anywhere; }
    .details { margin: 0 0 1mm; font-size: 7pt; }
    svg { display: block; width: 44mm; max-height: 19mm; margin: 0 auto; }
    @media screen { body { margin: 12mm auto; } }
  </style></head><body><p class="name">${escapeHtml(product.name)}</p>${details ? `<p class="details">${escapeHtml(details)}</p>` : ''}${barcodeSvg}</body></html>`)
  printWindow.document.close()
  window.setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 250)
  return true
}
