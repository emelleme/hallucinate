import * as Ably from 'ably'

interface Env {
  ABLY_API_KEY?: string
  BACKEND_URL?: string
  HALLUCINATE_INTERNAL_TOKEN?: string
}

export const onRequest = async (context: { env: Env; request: Request }): Promise<Response> => {
  const apiKey = context.env.ABLY_API_KEY
  const backend = context.env.BACKEND_URL
  const internalToken = context.env.HALLUCINATE_INTERNAL_TOKEN
  if (!apiKey || !backend || !internalToken) {
    return new Response(JSON.stringify({ error: 'realtime unavailable' }), {
      status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }
  let backendUrl: URL
  try {
    backendUrl = new URL(backend)
  } catch {
    return new Response(JSON.stringify({ error: 'realtime unavailable' }), { status: 503 })
  }
  if (backendUrl.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'realtime unavailable' }), { status: 503 })
  }
  const incoming = new URL(context.request.url)
  const space = incoming.searchParams.get('space') || 'default'
  const target = new URL('/api/proof-pulse/realtime', backendUrl)
  target.searchParams.set('space', space)
  const headers = new Headers({ authorization: 'Bearer ' + internalToken, accept: 'application/json' })
  const cookie = context.request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  headers.set('origin', incoming.origin)
  try {
    const proof = await fetch(target, { headers, redirect: 'manual' })
    if (!proof.ok) {
      return new Response(JSON.stringify({ error: 'membership required' }), {
        status: proof.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }
    const data = await proof.json() as { clientId?: string; channels?: string[] }
    if (!data.clientId || !Array.isArray(data.channels) || data.channels.length < 1 || data.channels.length > 32) {
      return new Response(JSON.stringify({ error: 'realtime unavailable' }), { status: 503 })
    }
    const capability = Object.fromEntries(data.channels.map(channel => [channel, ['publish', 'subscribe', 'presence']]))
    const client = new Ably.Rest({ key: apiKey })
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: data.clientId,
      capability: JSON.stringify(capability),
      ttl: 600000,
    })
    return new Response(JSON.stringify(tokenRequest), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'realtime unavailable' }), {
      status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }
}
