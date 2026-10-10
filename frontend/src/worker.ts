interface Env {
  API_ORIGIN: string
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url)
    if (requestUrl.pathname !== '/api' && !requestUrl.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }

    const apiUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, `${env.API_ORIGIN.replace(/\/$/, '')}/`)
    try {
      return await fetch(new Request(apiUrl, request))
    } catch (error) {
      console.error('API proxy upstream request failed', error)
      return Response.json(
        { message: 'The service is temporarily unavailable. Please try again shortly.' },
        { status: 503, headers: { 'x-jibusales-proxy-error': 'upstream-unreachable' } },
      )
    }
  },
}
