// Currency Rates Service

export interface CurrencyRate {
  code: string
  name: string
  rate: number // Rate against base currency (USD)
  previousRate?: number
  lastUpdated: string
  change?: number
  changePercent?: number
}

export interface ExchangeRateResponse {
  base: string
  date: string
  rates: Record<string, number>
}

export interface CurrencyRatesServiceConfig {
  apiEndpoint: string
  apiKey?: string
  baseCurrency?: string
  cacheDuration?: number // in milliseconds
}

const DEFAULT_CACHE_DURATION = 60 * 60 * 1000 // 1 hour

class CurrencyRatesService {
  private apiEndpoint: string
  private apiKey?: string
  private baseCurrency: string
  private cacheDuration: number
  private cache: Map<string, { data: any; timestamp: number }> = new Map()

  constructor(config: CurrencyRatesServiceConfig) {
    this.apiEndpoint = config.apiEndpoint
    this.apiKey = config.apiKey
    this.baseCurrency = config.baseCurrency || 'USD'
    this.cacheDuration = config.cacheDuration || DEFAULT_CACHE_DURATION
  }

  /**
   * Get current exchange rates
   */
  async getRates(): Promise<ExchangeRateResponse> {
    const cacheKey = `rates_${this.baseCurrency}`
    const cached = this.getFromCache(cacheKey)
    
    if (cached) {
      return cached
    }

    const response = await this.fetchRates()
    this.setCache(cacheKey, response)
    
    return response
  }

  /**
   * Get rate for specific currency
   */
  async getRate(currencyCode: string): Promise<CurrencyRate> {
    const rates = await this.getRates()
    const rate = rates.rates[currencyCode]
    
    if (rate === undefined) {
      throw new Error(`Currency ${currencyCode} not found`)
    }

    return {
      code: currencyCode,
      name: this.getCurrencyName(currencyCode),
      rate,
      lastUpdated: rates.date,
    }
  }

  /**
   * Convert amount between currencies
   */
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<{ amount: number; rate: number }> {
    const rates = await this.getRates()
    
    const fromRate = rates.rates[fromCurrency] || 1
    const toRate = rates.rates[toCurrency] || 1
    
    // Convert to base currency first, then to target
    const baseAmount = amount / fromRate
    const convertedAmount = baseAmount * toRate
    const rate = toRate / fromRate
    
    return {
      amount: convertedAmount,
      rate,
    }
  }

  /**
   * Get historical rates
   */
  async getHistoricalRates(
    date: string,
    currencies?: string[]
  ): Promise<ExchangeRateResponse> {
    const cacheKey = `historical_${date}_${currencies?.join(',') || 'all'}`
    const cached = this.getFromCache(cacheKey)
    
    if (cached) {
      return cached
    }

    const url = `${this.apiEndpoint}/${date}?base=${this.baseCurrency}`
    const response = await this.fetchWithAuth(url)
    const data = await response.json()
    
    this.setCache(cacheKey, data)
    
    return data
  }

  /**
   * Get rate changes/trends
   */
  async getRateTrend(
    currencyCode: string,
    days: number = 7
  ): Promise<{ date: string; rate: number }[]> {
    const trends: { date: string; rate: number }[] = []
    const today = new Date()
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      
      try {
        const historical = await this.getHistoricalRates(dateStr, [currencyCode])
        trends.push({
          date: dateStr,
          rate: historical.rates[currencyCode] || 0,
        })
      } catch {
        // Skip dates with no data
      }
    }
    
    return trends.reverse()
  }

  /**
   * Fetch rates from API
   */
  private async fetchRates(): Promise<ExchangeRateResponse> {
    const url = `${this.apiEndpoint}/latest?base=${this.baseCurrency}`
    const response = await this.fetchWithAuth(url)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch rates: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Fetch with authentication if API key is set
   */
  private async fetchWithAuth(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    
    return fetch(url, { headers })
  }

  /**
   * Get currency name from code
   */
  private getCurrencyName(code: string): string {
    const names: Record<string, string> = {
      USD: 'US Dollar',
      EUR: 'Euro',
      GBP: 'British Pound',
      UGX: 'Ugandan Shilling',
      KES: 'Kenyan Shilling',
      TZS: 'Tanzanian Shilling',
      RWF: 'Rwandan Franc',
      ZAR: 'South African Rand',
      JPY: 'Japanese Yen',
      CNY: 'Chinese Yuan',
    }
    
    return names[code] || code
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key)
    
    if (!cached) return null
    
    const now = Date.now()
    if (now - cached.timestamp > this.cacheDuration) {
      this.cache.delete(key)
      return null
    }
    
    return cached.data
  }

  /**
   * Set cache
   */
  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}

export { CurrencyRatesService }
export default CurrencyRatesService
