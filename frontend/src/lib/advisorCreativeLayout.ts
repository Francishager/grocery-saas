import type { AdvisorVisual } from './advisorVisuals'

type Data = NonNullable<AdvisorVisual['data']>
export type CreativePalette = { accent: string; pale: string; secondary: string; ink: string; soft: string }
type Box = { x: number; y: number; width: number; height: number }
type Block = { value: string; max: number; min: number; bold?: boolean; color?: string }
type Run = Block & { size: number; rows: string[]; leading: number; height: number }
const font = (size: number, bold = false) => `${bold ? 700 : 400} ${size}px "Geist Variable", Arial, sans-serif`
const margin = 72, width = 1080, usable = width - margin * 2

function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const rows: string[] = []
  for (const paragraph of value.split('\n')) {
    let row = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (ctx.measureText(row ? `${row} ${word}` : word).width <= maxWidth) { row = row ? `${row} ${word}` : word; continue }
      if (row) rows.push(row)
      row = ''
      for (const char of Array.from(word)) {
        if (row && ctx.measureText(row + char).width > maxWidth) { rows.push(row); row = '' }
        row += char
      }
    }
    if (row) rows.push(row)
  }
  return rows
}

// Measure the complete group before drawing. Never crop, truncate or overlap essential copy.
function plan(ctx: CanvasRenderingContext2D, blocks: Block[], box: Box, gap = 20) {
  const active = blocks.filter(block => block.value.trim())
  for (let step = 100; step >= 0; step--) {
    const runs: Run[] = active.map(block => {
      const size = Math.round(block.min + (block.max - block.min) * step / 100)
      ctx.font = font(size, block.bold)
      const rows = wrap(ctx, block.value, box.width), leading = size * (block.bold ? 1.16 : 1.32)
      return { ...block, size, rows, leading, height: rows.length * leading }
    })
    const height = runs.reduce((total, run) => total + run.height, 0) + Math.max(0, runs.length - 1) * gap
    if (height <= box.height) return { runs, height, gap }
  }
  throw new Error('This wording is too long for a readable design. Shorten the text or choose Portrait or Story before downloading.')
}
function draw(ctx: CanvasRenderingContext2D, group: ReturnType<typeof plan>, box: Box, color: string, centered = false) {
  let y = box.y + (centered ? (box.height - group.height) / 2 : 0)
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'
  for (const run of group.runs) {
    ctx.font = font(run.size, run.bold); ctx.fillStyle = run.color || color
    for (const row of run.rows) { ctx.fillText(row, box.x, y); y += run.leading }
    y += group.gap
  }
}
function photo(ctx: CanvasRenderingContext2D, image: HTMLImageElement, box: Box) {
  const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight)
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale
  ctx.drawImage(image, box.x + (box.width - w) / 2, box.y + (box.height - h) / 2, w, h)
}
function fill(ctx: CanvasRenderingContext2D, color: string, box: Box) { ctx.fillStyle = color; ctx.fillRect(box.x, box.y, box.width, box.height) }
function productText(data: Data) {
  if (!data.product) return ''
  const price = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(data.product.price)
  return `${data.product.name}\nListed price: ${data.brand.currency || 'UGX'} ${price}${data.product.unit ? ` / ${data.product.unit}` : ''}`
}

export function drawCreative(ctx: CanvasRenderingContext2D, data: Data, image: HTMLImageElement | null, logo: HTMLImageElement | null, palette: CreativePalette, height: number) {
  const footerY = height - 140
  const offer = data.copy.offer || ''
  const headline: Block = { value: data.copy.headline, max: 88, min: 44, bold: true }
  const offerBlock: Block = { value: offer, max: 64, min: 34, bold: true, color: palette.accent }
  const supporting: Block[] = [
    { value: data.copy.subheading, max: 38, min: 26, bold: true },
    { value: data.copy.body, max: 32, min: 24 },
  ]
  const product: Block = { value: productText(data), max: 28, min: 24, bold: true }
  const requested = data.layout || 'auto'
  const layout = requested === 'auto' ? (offer ? 'offer' : image ? 'product' : 'editorial') : requested
  let paint: () => void

  try {
    if (layout === 'product' && image) {
      const heroHeight = height === 1920 ? 970 : height === 1350 ? 680 : 470
      const hero = { x: margin, y: 204, width: 448, height: heroHeight }
      const imageBox = { x: 580, y: 204, width: 428, height: heroHeight - (data.product ? 150 : 0) }
      const productBox = { x: 580, y: 204 + imageBox.height + 24, width: 428, height: 126 }
      const details = { x: margin, y: hero.y + hero.height + 40, width: usable, height: footerY - hero.y - hero.height - 76 }
      const title = plan(ctx, [headline, offerBlock], hero, 30)
      const description = plan(ctx, supporting, details)
      const item = plan(ctx, [product], productBox, 0)
      paint = () => {
        fill(ctx, palette.pale, { x: 552, y: 176, width: 528, height: heroHeight + 56 })
        fill(ctx, palette.secondary, { x: 552, y: 176, width: 528, height: 10 })
        draw(ctx, title, hero, palette.ink, true)
        photo(ctx, image, imageBox)
        draw(ctx, item, productBox, palette.ink)
        draw(ctx, description, details, palette.ink)
      }
    } else if (layout === 'offer' && offer) {
      const banner = { x: margin, y: 226, width: usable, height: height === 1080 ? 222 : height === 1350 ? 302 : 462 }
      const offerTitle = plan(ctx, [{ ...offerBlock, color: '#ffffff', max: 144, min: 60 }], banner)
      const contentY = banner.y + banner.height + 90
      const details = { x: margin, y: contentY, width: image ? 480 : usable, height: footerY - contentY - 36 }
      const description = plan(ctx, [{ ...headline, max: 60, min: 34 }, ...supporting.map(block => ({ ...block, max: 30 })), ...(!image ? [product] : [])], details)
      const itemBox = { x: 600, y: footerY - 146, width: 408, height: 110 }
      const item = plan(ctx, [product], itemBox)
      paint = () => {
        fill(ctx, palette.accent, { x: 0, y: 176, width, height: banner.height + 100 })
        fill(ctx, palette.secondary, { x: 0, y: 176, width: 14, height: banner.height + 100 })
        draw(ctx, offerTitle, banner, '#ffffff', true)
        draw(ctx, description, details, palette.ink)
        if (image) {
          photo(ctx, image, { x: 600, y: contentY, width: 408, height: itemBox.y - contentY - 24 })
          draw(ctx, item, itemBox, palette.ink)
        }
      }
    } else {
      const banner = { x: margin, y: 230, width: usable, height: height === 1080 ? 300 : height === 1350 ? 460 : 780 }
      const title = plan(ctx, [headline, { ...offerBlock, color: palette.secondary }], banner, 30)
      const contentY = banner.y + banner.height + 100
      const details = { x: image ? 456 : margin, y: contentY, width: image ? 552 : usable, height: footerY - contentY - 36 }
      const description = plan(ctx, [...supporting, product], details)
      paint = () => {
        fill(ctx, palette.ink, { x: 0, y: 176, width, height: banner.height + 110 })
        fill(ctx, palette.secondary, { x: margin, y: 200, width: 92, height: 8 })
        draw(ctx, title, banner, '#ffffff', true)
        if (image) photo(ctx, image, { x: margin, y: contentY, width: 328, height: details.height })
        draw(ctx, description, details, palette.ink)
      }
    }
  } catch {
    // Long saved copy gets a full-width composition, retaining the photo and every word.
    const available = footerY - 240
    const topBox = { x: margin, y: 204, width: usable, height: available * (image ? 0.34 : 0.45) }
    const title = plan(ctx, [{ ...headline, max: 68, min: 32 }, { ...offerBlock, max: 50, min: 32 }], topBox, 16)
    const bottomBox = { x: margin, y: 0, width: usable, height: available - title.height - (image ? 200 : 24) }
    const description = plan(ctx, [...supporting, product], bottomBox, 14)
    const photoHeight = available - title.height - description.height - 40
    bottomBox.y = image ? footerY - 36 - description.height : topBox.y + title.height + 36
    paint = () => {
      fill(ctx, palette.secondary, { x: margin, y: 180, width: 92, height: 8 })
      draw(ctx, title, topBox, palette.ink)
      if (image) photo(ctx, image, { x: margin, y: topBox.y + title.height + 20, width: usable, height: photoHeight })
      draw(ctx, description, bottomBox, palette.ink)
    }
  }

  const brandBox = { x: logo ? 280 : margin, y: 46, width: logo ? 728 : usable, height: 86 }
  const brand = plan(ctx, [{ value: data.brand.name || 'Business', max: 36, min: 22, bold: true }], brandBox)
  const ctaBox = { x: margin, y: footerY + 36, width: usable, height: 70 }
  const cta = plan(ctx, [{ value: data.copy.cta || 'Visit us today', max: 40, min: 28, bold: true }], ctaBox)
  fill(ctx, '#ffffff', { x: 0, y: 0, width, height })
  paint()
  if (logo) photo(ctx, logo, { x: margin, y: 34, width: 160, height: 112 })
  draw(ctx, brand, brandBox, palette.ink, true)
  fill(ctx, palette.accent, { x: 0, y: 0, width, height: 10 })
  fill(ctx, palette.accent, { x: 0, y: footerY, width, height: 140 })
  draw(ctx, cta, ctaBox, '#ffffff', true)
  fill(ctx, palette.secondary, { x: 0, y: height - 10, width, height: 10 })
}
