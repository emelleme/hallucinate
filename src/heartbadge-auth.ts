import { base64urlToBuffer, bufferToBase64url } from './heartbadge-auth-helpers.ts'

export async function requestApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body?.error ?? 'Request failed.')
  }

  return body as T
}

export async function checkHeartbadgeSession(): Promise<{ email: string; displayName: string | null } | null> {
  try {
    const res = await requestApi<{ ok: boolean; security?: { email?: string; displayName?: string } }>(
      '/api/member/security/status'
    )
    if (res.security?.email) {
      return {
        email: res.security.email,
        displayName: res.security.displayName || null,
      }
    }
  } catch (e) {
    // signed out
  }
  return null
}

export async function queryAuthMethods(email: string): Promise<{ methods: string[]; maskedEmail: string }> {
  return requestApi<{ methods: string[]; maskedEmail: string }>('/api/member/auth/methods', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function startAuth(email: string): Promise<{ maskedEmail: string; resendAfterSec: number; dispatchState: string }> {
  return requestApi<{ maskedEmail: string; resendAfterSec: number; dispatchState: string }>('/api/member/auth/start', {
    method: 'POST',
    body: JSON.stringify({ email, reason: 'login' }),
  })
}

export async function verifyAuth(email: string, code: string): Promise<any> {
  return requestApi('/api/member/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

export async function verifyTotpLogin(email: string, code: string): Promise<any> {
  return requestApi('/api/member/auth/totp-login', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
}

function toCredentialDescriptor(credential: any): PublicKeyCredentialDescriptor {
  return {
    id: base64urlToBuffer(String(credential.id)),
    type: 'public-key',
    transports: Array.isArray(credential.transports) ? credential.transports : undefined,
  }
}

export async function loginWithHeartbadgePasskey(email?: string): Promise<any> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials?.get) {
    throw new Error('Passkeys are not supported in this browser.')
  }

  const body = email?.trim() ? { email } : {}
  const startResponse = await requestApi<{ ok: boolean; options: any }>('/api/member/auth/passkey-login/start', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  const options = startResponse.options
  const allowCredentials = Array.isArray(options.allowCredentials)
    ? options.allowCredentials.map(toCredentialDescriptor)
    : []

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: base64urlToBuffer(options.challenge),
    rpId: options.rpId,
    timeout: options.timeout ?? 300_000,
    userVerification: options.userVerification ?? 'required',
  }

  if (allowCredentials.length > 0) {
    publicKey.allowCredentials = allowCredentials
  }

  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null
  if (!assertion) {
    throw new Error('Passkey sign-in was cancelled.')
  }

  const assertionResponse = assertion.response as AuthenticatorAssertionResponse
  const credential = {
    id: assertion.id,
    rawId: bufferToBase64url(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
      clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
      signature: bufferToBase64url(assertionResponse.signature),
      userHandle: assertionResponse.userHandle ? bufferToBase64url(assertionResponse.userHandle) : null,
    },
  }

  return requestApi('/api/member/auth/passkey-login/complete', {
    method: 'POST',
    body: JSON.stringify(email?.trim() ? { email, credential } : { credential }),
  })
}
