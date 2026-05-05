// Business Owner Invitation Service

export interface Invitation {
  id: string
  email: string
  name?: string
  phone?: string
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  invitedBy: string
  invitedAt: string
  expiresAt: string
  acceptedAt?: string
  acceptedBy?: string
  tenantId?: string
  tenantName?: string
  planId?: string
  planName?: string
  message?: string
}

export interface InvitationCreateInput {
  email: string
  name?: string
  phone?: string
  planId?: string
  message?: string
}

export interface InvitationStats {
  total: number
  pending: number
  accepted: number
  expired: number
  cancelled: number
}

class InviteService {
  private apiEndpoint: string
  private apiKey?: string

  constructor(apiEndpoint: string = '/api/invitations', apiKey?: string) {
    this.apiEndpoint = apiEndpoint
    this.apiKey = apiKey
  }

  /**
   * Create a new invitation for business owner
   */
  async create(data: InvitationCreateInput): Promise<Invitation> {
    const response = await this.fetchWithAuth(this.apiEndpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to create invitation')
    }

    return response.json()
  }

  /**
   * Create multiple invitations at once
   */
  async createBatch(invitations: InvitationCreateInput[]): Promise<Invitation[]> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/batch`, {
      method: 'POST',
      body: JSON.stringify({ invitations }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to create invitations')
    }

    return response.json()
  }

  /**
   * Get all invitations (SaaS Admin only)
   */
  async getAll(filters?: {
    status?: Invitation['status']
    search?: string
    page?: number
    limit?: number
  }): Promise<{ invitations: Invitation[]; total: number; stats: InvitationStats }> {
    const params = new URLSearchParams()
    
    if (filters?.status) params.append('status', filters.status)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.limit) params.append('limit', String(filters.limit))

    const response = await this.fetchWithAuth(
      `${this.apiEndpoint}?${params.toString()}`
    )

    if (!response.ok) {
      throw new Error('Failed to fetch invitations')
    }

    return response.json()
  }

  /**
   * Get invitation by ID
   */
  async getById(id: string): Promise<Invitation> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}`)

    if (!response.ok) {
      throw new Error('Failed to fetch invitation')
    }

    return response.json()
  }

  /**
   * Get invitation by token (for acceptance page)
   */
  async getByToken(token: string): Promise<Invitation> {
    const response = await fetch(`${this.apiEndpoint}/token/${token}`)

    if (!response.ok) {
      throw new Error('Invalid or expired invitation')
    }

    return response.json()
  }

  /**
   * Cancel an invitation
   */
  async cancel(id: string): Promise<Invitation> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}/cancel`, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Failed to cancel invitation')
    }

    return response.json()
  }

  /**
   * Resend invitation email
   */
  async resend(id: string): Promise<Invitation> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}/resend`, {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Failed to resend invitation')
    }

    return response.json()
  }

  /**
   * Accept invitation and create account
   */
  async accept(token: string, data: {
    password: string
    name: string
    phone?: string
    businessName: string
    businessType?: string
  }): Promise<{ user: any; tokens: any; tenant: any }> {
    const response = await fetch(`${this.apiEndpoint}/accept/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to accept invitation')
    }

    return response.json()
  }

  /**
   * Get invitation statistics
   */
  async getStats(): Promise<InvitationStats> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/stats`)

    if (!response.ok) {
      throw new Error('Failed to fetch invitation statistics')
    }

    return response.json()
  }

  /**
   * Extend invitation expiry
   */
  async extendExpiry(id: string, days: number = 7): Promise<Invitation> {
    const response = await this.fetchWithAuth(`${this.apiEndpoint}/${id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    })

    if (!response.ok) {
      throw new Error('Failed to extend invitation')
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

    // Get token from localStorage
    const tokens = localStorage.getItem('auth_tokens')
    if (tokens) {
      try {
        const { accessToken } = JSON.parse(tokens)
        headers['Authorization'] = `Bearer ${accessToken}`
      } catch {
        // Ignore parse errors
      }
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    return fetch(url, {
      ...options,
      headers,
    })
  }
}

export { InviteService }
export default new InviteService()
