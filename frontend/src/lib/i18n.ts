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
