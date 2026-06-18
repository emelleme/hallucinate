interface PagesContext {
  request: Request
  env: {
    BACKEND_URL?: string
    HEARTBADGE_API_URL?: string
  }
  next: (request?: Request) => Promise<Response>
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const url = new URL(context.request.url)
  const path = url.pathname

  const isWs = context.request.headers.get('upgrade')?.toLowerCase() === 'websocket'
  const isBackendPath =
    (path.startsWith('/api/') ||
    path.startsWith('/graffiti/') ||
    path === '/photos' ||
    path.startsWith('/photos/')) &&
    path !== '/api/ably-token'

  if (isWs || isBackendPath) {
    const isMemberApi = path.startsWith('/api/member/')
    const backendUrl = isMemberApi
      ? (context.env.HEARTBADGE_API_URL || 'https://heartbeat-landing.pages.dev')
      : (context.env.BACKEND_URL || 'http://backend.hallucinate.stagas.com')
    const targetUrl = new URL(url.pathname + url.search, backendUrl)

    const headers = new Headers(context.request.headers)
    headers.set('x-original-origin', url.origin)
    const clientIp = context.request.headers.get('cf-connecting-ip')
    if (clientIp) {
      headers.set('x-forwarded-for', clientIp)
      headers.set('x-real-ip', clientIp)
    }

    // Pass Basic Auth credentials if targeting Cloudflare Pages preview environments
    if (targetUrl.hostname.endsWith('.pages.dev') && !headers.has('Authorization')) {
      headers.set('Authorization', 'Basic aGVhcnRiYWRnZTpwcmV2aWV3LWFjY2Vzcy0yMDI2')
    }

    const requestInit: RequestInit = {
      method: context.request.method,
      headers,
      redirect: 'manual',
    }

    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
      requestInit.body = context.request.body
    }

    try {
      const response = await fetch(targetUrl.toString(), requestInit)
      const responseHeaders = new Headers(response.headers)
      // Strip WWW-Authenticate header to prevent native browser Sign In popup on 401
      responseHeaders.delete('www-authenticate')

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
    } catch (e: any) {
      return new Response(`Proxy error: ${e?.message || String(e)}`, { status: 502 })
    }
  }

  // Rewrite gallery permalinks (e.g. /gallery/12345) to serve gallery.html
  if (path.startsWith('/gallery/') && !path.endsWith('.js') && !path.endsWith('.css')) {
    const rewriteUrl = new URL(url.toString())
    rewriteUrl.pathname = '/gallery.html'
    return context.next(new Request(rewriteUrl.toString(), context.request))
  }

  return context.next()
}
