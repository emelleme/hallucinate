import * as Ably from 'ably'

interface Env {
  ABLY_API_KEY?: string
}

export const onRequest = async (context: { env: Env; request: Request }): Promise<Response> => {
  const apiKey = context.env.ABLY_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ABLY_API_KEY not configured' }), {
      status: 500,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
    })
  }

  try {
    const client = new Ably.Rest({ key: apiKey })
    const url = new URL(context.request.url)
    const clientId = url.searchParams.get('clientId') || `client_${Math.random().toString(36).substring(2, 11)}`
    const tokenRequest = await client.auth.createTokenRequest({ clientId })

    return new Response(JSON.stringify(tokenRequest), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
      },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
    })
  }
}
