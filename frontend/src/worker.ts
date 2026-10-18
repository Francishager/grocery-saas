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
      return withSecurityHeaders(await env.ASSETS.fetch(request))
    }

    const apiUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, `${env.API_ORIGIN.replace(/\/$/, '')}/`)
    try {
      return withSecurityHeaders(await fetch(new Request(apiUrl, request)))
    } catch (error) {
      console.error('API proxy upstream request failed', error)
      return withSecurityHeaders(Response.json(
        { message: 'The service is temporarily unavailable. Please try again shortly.' },
        { status: 503, headers: { 'x-jibusales-proxy-error': 'upstream-unreachable' } },
      ))
    }
  },
}
