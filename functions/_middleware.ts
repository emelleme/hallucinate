interface PagesContext {
  request: Request
  env: { BACKEND_URL?: string }
  next: (request?: Request) => Promise<Response>
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const url = new URL(context.request.url)
  const path = url.pathname
  if (path.startsWith('/api/member/')) {
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  }
  const isWs = context.request.headers.get('upgrade')?.toLowerCase() === 'websocket'
  const isBackendPath = (
    path.startsWith('/api/') ||
    path.startsWith('/graffiti/') ||
    path === '/photos' ||
    path.startsWith('/photos/')
  ) && path !== '/api/ably-token'

  if (isWs || isBackendPath) {
    const backendUrl = context.env.BACKEND_URL || ''
    let parsed: URL
    try {
      parsed = new URL(backendUrl)
    } catch {
      return new Response('Party backend unavailable', { status: 503 })
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return new Response('Party backend requires HTTPS', { status: 503 })
    }
    const targetUrl = new URL(url.pathname + url.search, parsed)
    const headers = new Headers(context.request.headers)
    headers.set('x-original-origin', url.origin)
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
      const response = await fetch(targetUrl.toString(), requestInit)
      const responseHeaders = new Headers(response.headers)
      responseHeaders.delete('www-authenticate')
      responseHeaders.set('cache-control', 'no-store')
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders })
    } catch {
      return new Response('Party backend unavailable', { status: 502 })
    }
  }

  if (path.startsWith('/gallery/') && !path.endsWith('.js') && !path.endsWith('.css')) {
    const rewriteUrl = new URL(url.toString())
    rewriteUrl.pathname = '/gallery.html'
    return context.next(new Request(rewriteUrl.toString(), context.request))
  }
  return context.next()
}
