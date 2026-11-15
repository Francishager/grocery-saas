interface Env {
  API_ORIGIN: string
  ASSETS: { fetch(request: Request): Promise<Response> }
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Strict-Transport-Security', 'max-age=31536000')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url)
    if (requestUrl.pathname !== '/api' && !requestUrl.pathname.startsWith('/api/')) {
      const response = await env.ASSETS.fetch(request)
      if (requestUrl.pathname.startsWith('/assets/') && response.headers.get('content-type')?.includes('text/html')) {
        return withSecurityHeaders(new Response('Asset not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))
      }
      return withSecurityHeaders(response)
    }

    const apiUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, `${env.API_ORIGIN.replace(/\/$/, '')}/`)
    try {
      const upstreamRequest = new Request(apiUrl, request)
      upstreamRequest.headers.delete('cookie')
      return withSecurityHeaders(await fetch(upstreamRequest))
    } catch (error) {
      console.error('API proxy upstream request failed', error)
      return withSecurityHeaders(Response.json(
        { message: 'The service is temporarily unavailable. Please try again shortly.' },
        { status: 503, headers: { 'x-jibusales-proxy-error': 'upstream-unreachable' } },
      ))
    }
  },
}
