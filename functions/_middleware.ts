interface PagesContext {
  request: Request
  env: {
    BACKEND_URL?: string
  }
  next: () => Promise<Response>
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const url = new URL(context.request.url)
  const path = url.pathname

  const isWs = context.request.headers.get('upgrade')?.toLowerCase() === 'websocket'
  const isBackendPath =
    path.startsWith('/api/') ||
    path.startsWith('/graffiti/') ||
    path === '/photos' ||
    path.startsWith('/photos/') ||
    path === '/analytics' ||
    path.startsWith('/analytics/') ||
    path === '/gallery' ||
    path.startsWith('/gallery/')

  if (isWs || isBackendPath) {
    const backendUrl = context.env.BACKEND_URL || 'https://backend.hallucinate.stagas.com'
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

    return fetch(targetUrl.toString(), requestInit)
  }

  return context.next()
}
