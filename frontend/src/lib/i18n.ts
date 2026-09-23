import { languageOptions } from '@/components/Constants/user-types'

export type LanguageCode = 'en' | 'sw' | 'lg' | 'nyn' | 'rw' | 'nyo' | 'ach'

const common: Record<string, string> = {
  'Dashboard': 'Dashibodi', 'Sales': 'Mauzo', 'Inventory': 'Hesabu ya bidhaa', 'Products': 'Bidhaa',
  'Services': 'Huduma', 'Customers': 'Wateja', 'Suppliers': 'Wasambazaji', 'Receivables': 'Madeni ya wateja',
  'Payables': 'Madeni ya wasambazaji', 'Expenses': 'Gharama', 'Accounting': 'Uhasibu', 'Reports': 'Ripoti',
  'Human Resources': 'Rasilimali watu', 'HR Management': 'Usimamizi wa rasilimali watu', 'Settings': 'Mipangilio',
  'Business Settings': 'Mipangilio ya biashara', 'Profile': 'Wasifu', 'Logout': 'Ondoka', 'Search': 'Tafuta',
  'Save': 'Hifadhi', 'Save Changes': 'Hifadhi mabadiliko', 'Cancel': 'Ghairi', 'Close': 'Funga',
  'Edit': 'Hariri', 'Delete': 'Futa', 'Create': 'Unda', 'View': 'Tazama', 'Print': 'Chapisha',
  'Download': 'Pakua', 'Export': 'Hamisha', 'Today': 'Leo', 'Date': 'Tarehe', 'Amount': 'Kiasi',
  'Total': 'Jumla', 'Status': 'Hali', 'Actions': 'Vitendo', 'Name': 'Jina', 'Phone': 'Simu',
  'Email': 'Barua pepe', 'Address': 'Anwani', 'Cash at Hand': 'Fedha mkononi', 'Net Cash Movement': 'Mabadiliko halisi ya fedha',
  'Cash Sales': 'Mauzo ya fedha', 'Credit Sales': 'Mauzo kwa mkopo', 'Debt Collections': 'Makusanyo ya madeni',
  'Gross Profit': 'Faida ghafi', 'Net Profit': 'Faida halisi', 'Revenue': 'Mapato', 'COGS': 'Gharama ya bidhaa zilizouzwa',
  'Profitability': 'Faida', 'Cash Status Report': 'Ripoti ya hali ya fedha', 'Daily Business Report': 'Ripoti ya biashara ya kila siku',
  'Financial Reports': 'Ripoti za fedha', 'Sales Reports': 'Ripoti za mauzo', 'Inventory Reports': 'Ripoti za bidhaa',
  'Customer Reports': 'Ripoti za wateja', 'Supplier Reports': 'Ripoti za wasambazaji', 'Receivables Reports': 'Ripoti za madeni ya wateja',
  'Payables Reports': 'Ripoti za madeni ya wasambazaji', 'Language': 'Lugha', 'Preferred Language': 'Lugha unayopendelea',
  'First Name': 'Jina la kwanza', 'Last Name': 'Jina la mwisho', 'Customer Name': 'Jina la mteja',
  'Supplier Name': 'Jina la msambazaji', 'Product Name': 'Jina la bidhaa', 'Service Name': 'Jina la huduma',
  'Quantity': 'Kiasi', 'Unit Price': 'Bei ya moja', 'Selling Price': 'Bei ya kuuza', 'Cost Price': 'Bei ya gharama',
  'Payment Method': 'Njia ya malipo', 'Select Customer': 'Chagua mteja', 'Select Product': 'Chagua bidhaa',
  'Select Service': 'Chagua huduma', 'Add Customer': 'Ongeza mteja', 'Add Product': 'Ongeza bidhaa',
  'New Sale': 'Mauzo mapya', 'Record Sale': 'Rekodi mauzo', 'Record Payment': 'Rekodi malipo',
  'Opening Balance': 'Salio la mwanzo', 'Credit Limit': 'Kikomo cha mkopo', 'Balance': 'Salio',
  'Discount': 'Punguzo', 'Tax': 'Kodi', 'Subtotal': 'Jumla ndogo', 'Grand Total': 'Jumla kuu',
  'Required': 'Inahitajika', 'Optional': 'Si lazima', 'Loading...': 'Inapakia...', 'No data found': 'Hakuna data iliyopatikana',
  'Filter': 'Chuja', 'Clear': 'Futa', 'Refresh': 'Onyesha upya', 'Next': 'Ifuatayo', 'Previous': 'Iliyotangulia',
  'Page': 'Ukurasa', 'of': 'ya', 'Start Date': 'Tarehe ya kuanza', 'End Date': 'Tarehe ya mwisho',
  'Notes': 'Maelezo', 'Description': 'Maelezo', 'Reference': 'Rejea', 'Account': 'Akaunti',
}

const translations: Partial<Record<LanguageCode, Record<string, string>>> = {
  sw: common,
  lg: { Dashboard: 'Dashibodi', Sales: 'Okutunda', Inventory: 'Ebintu ebiri mu sitoowa', Products: 'Ebintu', Services: 'Obuweereza', Customers: 'Bak müşter', Suppliers: 'Abagaba ebintu', Receivables: 'Amabanja g’abaguzi', Payables: 'Amabanja g’abagaba ebintu', Expenses: 'Ensimbi ezifulumye', Accounting: 'Okubalirira', Reports: 'Lipoota', Settings: 'Enteekateeka', Profile: 'Profayiro', Logout: 'Fuluma', Search: 'Noonya', Save: 'Tereka', Cancel: 'Sazaamu', Close: 'Ggalawo', Edit: 'Kyusa', Delete: 'Gyawo', Create: 'Kola', View: 'Laba', Print: 'Kuba ku olupapula', Download: 'Wanula', Total: 'Awamu', Amount: 'Omuwendo', Status: 'Embeera', Name: 'Erinnya', Phone: 'Essimu', Email: 'Email', Address: 'Endagiriro', 'Cash at Hand': 'Ensimbi eziri mu ngalo', 'Cash Sales': 'Okutunda mu nsimbi', 'Credit Sales': 'Okutunda ku bbanja', 'Gross Profit': 'Amagoba amagazi', 'Net Profit': 'Amagoba amalongoose', Revenue: 'Enyingiza', Language: 'Olulimi', 'Preferred Language': 'Olulimi lw’oyagala' },
  nyn: { Dashboard: 'Ekipande', Sales: 'Obuguzi', Inventory: 'Ebintu omukiterekero', Products: 'Ebintu', Services: 'Obuheereza', Customers: 'Abaguzi', Suppliers: 'Abagaba ebintu', Receivables: 'Amabanja g’abaguzi', Payables: 'Amabanja g’abagaba ebintu', Expenses: 'Ensimbi ezakozesibwa', Accounting: 'Okubara', Reports: 'Ripoota', Settings: 'Enteekateeka', Profile: 'Omwirondoro', Logout: 'Fuma', Search: 'Ronda', Save: 'Tereka', Cancel: 'Hagarika', Close: 'Ggalawo', Edit: 'Hindura', Delete: 'Shazamu', Create: 'Kora', View: 'Reeba', Print: 'Kuba', Download: 'Tereka ahansi', Total: 'Hamwe', Amount: 'Omuwendo', Status: 'Embeera', Name: 'Erinya', Phone: 'Simu', Address: 'Endagiriro', 'Cash at Hand': 'Ensimbi eziri omukono', 'Cash Sales': 'Obuguzi bw’ensimbi', 'Credit Sales': 'Obuguzi bw’ebbanja', 'Gross Profit': 'Amagoba', 'Net Profit': 'Amagoba agasigara', Revenue: 'Enyingiza', Language: 'Orurimi', 'Preferred Language': 'Orurimi orw’oyenda' },
  rw: { Dashboard: 'Imbonerahamwe', Sales: 'Ubucuruzi', Inventory: 'Ububiko', Products: 'Ibicuruzwa', Services: 'Serivisi', Customers: 'Abakiriya', Suppliers: 'Abatanga ibicuruzwa', Receivables: 'Amadeni y’abakiriya', Payables: 'Amadeni y’abatanga ibicuruzwa', Expenses: 'Amafaranga yakoreshejwe', Accounting: 'Ibaruramari', Reports: 'Raporo', Settings: 'Igenamiterere', Profile: 'Umwirondoro', Logout: 'Sohoka', Search: 'Shakisha', Save: 'Bika', Cancel: 'Hagarika', Close: 'Funga', Edit: 'Hindura', Delete: 'Siba', Create: 'Kora', View: 'Reba', Print: 'Shyira ku rupapuro', Download: 'Manura', Total: 'Igiteranyo', Amount: 'Amafaranga', Status: 'Imimerere', Name: 'Izina', Phone: 'Telefone', Email: 'Imeyili', Address: 'Aderesi', 'Cash at Hand': 'Amafaranga ari mu ntoki', 'Cash Sales': 'Ubucuruzi bw’amafaranga', 'Credit Sales': 'Ubucuruzi bw’inguzanyo', 'Gross Profit': 'Inyungu mbisi', 'Net Profit': 'Inyungu nyayo', Revenue: 'Amafaranga yinjijwe', Language: 'Ururimi', 'Preferred Language': 'Ururimi ukunda' },
}

export const supportedLanguageOptions = languageOptions
export const translate = (language: string | undefined, key: string, fallback = key) => translations[(language || 'en') as LanguageCode]?.[key] || (language === 'en' || !language ? fallback : key)
export const languageLocale = (language: string) => ({ en: 'en-UG', sw: 'sw-KE', lg: 'lg-UG', nyn: 'nyn-UG', rw: 'rw-RW', nyo: 'nyo-UG', ach: 'ach-UG' } as Record<string, string>)[language] || 'en-UG'

const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Record<string, string>>()

const printExcluded = (element: Element | null) => {
  if (!element) return false
  if (element.closest('[data-print-exempt], .receipt-print, .print-receipt')) return true
  const marker = `${element.id} ${element.getAttribute('class') || ''}`.toLowerCase()
  return /(^|[\s_-])(receipt|print)([\s_-]|$)/.test(marker)
}

/** Translate live web UI text, including pages that render after navigation. Receipt/print surfaces are intentionally excluded. */
export function translateDocument(language: string) {
  if (typeof document === 'undefined') return () => undefined
  const attributes = ['placeholder', 'title', 'aria-label']
  const translateRoot = (root: Node) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node as Text
      const parent = text.parentElement
      if (!parent || printExcluded(parent) || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|OPTION)$/.test(parent.tagName)) continue
      const source = originalText.get(text) || text.data
      originalText.set(text, source)
      const leading = source.match(/^\s*/)?.[0] || ''
      const trailing = source.match(/\s*$/)?.[0] || ''
      const key = source.trim()
      const translated = key ? translate(language, key, key) : key
      if (translated !== key) text.data = `${leading}${translated}${trailing}`
      else if (text.data !== source) text.data = source
    }
    const elements: Element[] = []
    if (root instanceof Element && root.matches('input, textarea, [title], [aria-label]')) elements.push(root)
    if ('querySelectorAll' in root) elements.push(...Array.from((root as Element).querySelectorAll('input, textarea, [title], [aria-label]')))
    elements.forEach((element) => {
      if (printExcluded(element)) return
      const saved = originalAttributes.get(element) || {}
      originalAttributes.set(element, saved)
      attributes.forEach((attribute) => {
        const value = element.getAttribute(attribute)
        if (value && !saved[attribute]) saved[attribute] = value
        const source = saved[attribute]
        if (source) element.setAttribute(attribute, translate(language, source, source))
      })
    })
  }
  translateRoot(document.body)
  let frame = 0
  const pending: Node[] = []
  const flush = () => {
    frame = 0
    const nodes = pending.splice(0)
    nodes.forEach((node) => translateRoot(node))
  }
  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => pending.push(node)))
    if (!frame && pending.length) frame = window.requestAnimationFrame(flush)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => { observer.disconnect(); if (frame) window.cancelAnimationFrame(frame) }
}
