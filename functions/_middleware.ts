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
      ? (context.env.HEARTBADGE_API_URL || 'https://messagetest.heartbeat-landing.pages.dev')
      : (context.env.BACKEND_URL || 'http://backend.hallucinate.stagas.com')
    const targetUrl = new URL(url.pathname + url.search, backendUrl)

    const headers = new Headers(context.request.headers)
    const clientIp = context.request.headers.get('cf-connecting-ip')
    if (clientIp) {
      headers.set('x-forwarded-for', clientIp)
      headers.set('x-real-ip', clientIp)
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
      return await fetch(targetUrl.toString(), requestInit)
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
