// Branch Service

export interface Branch {
  id: string
  name: string
  code: string
  address?: string
  phone?: string
  email?: string
  managerId?: string
  managerName?: string
  status: 'active' | 'inactive'
  isHeadquarters: boolean
  settings: BranchSettings
  createdAt: string
  updatedAt: string
}

export interface BranchSettings {
  currency: string
  taxRate: number
  timezone: string
  dateFormat: string
  receiptFooter?: string
  lowStockThreshold: number
  enableInventory: boolean
  enableSales: boolean
  enablePurchases: boolean
  operatingHours?: {
    open: string
    close: string
    days: string[]
  }
}

export interface BranchCreateInput {
  name: string
  code: string
  address?: string
  phone?: string
  email?: string
  managerId?: string
  status?: 'active' | 'inactive'
  isHeadquarters?: boolean
  settings?: Partial<BranchSettings>
}

export interface BranchUpdateInput extends Partial<BranchCreateInput> {
  id: string
}

export interface BranchServiceConfig {
  apiEndpoint: string
  apiKey?: string
}

class BranchService {
  private apiEndpoint: string
  private apiKey?: string

  constructor(config: BranchServiceConfig) {
    this.apiEndpoint = config.apiEndpoint
    this.apiKey = config.apiKey
  }

  /**
   * Get all branches
   */
  async getAll(): Promise<Branch[]> {
    const response = await this.fetchWithAuth(this.apiEndpoint)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch branches: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Get branch by ID
   */
  async getById(id: string): Promise<Branch> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch branch: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Get branch by code
   */
  async getByCode(code: string): Promise<Branch> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/code/${code}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch branch: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Get active branches
   */
  async getActive(): Promise<Branch[]> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/active`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch active branches: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Get headquarters
   */
  async getHeadquarters(): Promise<Branch | null> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/headquarters`)
    
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Failed to fetch headquarters: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Create branch
   */
  async create(data: BranchCreateInput): Promise<Branch> {
    const response = await this.fetchWithAuth(this.apiEndpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to create branch')
    }
    
    return response.json()
  }

  /**
   * Update branch
   */
  async update(data: BranchUpdateInput): Promise<Branch> {
    const { id, ...updateData } = data
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to update branch')
    }
    
    return response.json()
  }

  /**
   * Delete branch
   */
  async delete(id: string): Promise<void> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}`, {
      method: 'DELETE',
    })
    
    if (!response.ok) {
      throw new Error(`Failed to delete branch: ${response.statusText}`)
    }
  }

  /**
   * Update branch settings
   */
  async updateSettings(id: string, settings: Partial<BranchSettings>): Promise<Branch> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    })
    
    if (!response.ok) {
      throw new Error(`Failed to update branch settings: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Assign manager to branch
   */
  async assignManager(branchId: string, managerId: string): Promise<Branch> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${branchId}/manager`, {
      method: 'POST',
      body: JSON.stringify({ managerId }),
    })
    
    if (!response.ok) {
      throw new Error(`Failed to assign manager: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Remove manager from branch
   */
  async removeManager(branchId: string): Promise<Branch> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${branchId}/manager`, {
      method: 'DELETE',
    })
    
    if (!response.ok) {
      throw new Error(`Failed to remove manager: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Set headquarters
   */
  async setAsHeadquarters(id: string): Promise<Branch> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}/headquarters`, {
      method: 'POST',
    })
    
    if (!response.ok) {
      throw new Error(`Failed to set as headquarters: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Activate branch
   */
  async activate(id: string): Promise<Branch> {
    return this.update({ id, status: 'active' })
  }

  /**
   * Deactivate branch
   */
  async deactivate(id: string): Promise<Branch> {
    return this.update({ id, status: 'inactive' })
  }

  /**
   * Get branch statistics
   */
  async getStatistics(id: string): Promise<{
    totalSales: number
    totalPurchases: number
    inventoryValue: number
    staffCount: number
    lastActivity: string
  }> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}/statistics`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch branch statistics: ${response.statusText}`)
    }
    
    return response.json()
  }

  /**
   * Fetch with authentication
   */
  private async fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers as Record<string, string>,
    }
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    
    return fetch(url, {
      ...options,
      headers,
    })
  }
}

export { BranchService }
export default BranchService
