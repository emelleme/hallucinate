export interface PartyProofSession {
  enabled?: boolean
  authenticated: boolean
  expiresAt?: number
  unavailable?: boolean
}

export async function checkPartyProofSession(): Promise<PartyProofSession> {
  try {
    const response = await fetch('/api/proof-pulse/session', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) return { authenticated: false, unavailable: true }
    return await response.json() as PartyProofSession
  } catch {
    return { authenticated: false, unavailable: true }
  }
}

export async function startPartyProof(): Promise<{ approvalUrl: string }> {
  const response = await fetch('/api/proof-pulse/start', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  const result = await response.json().catch(() => ({})) as { approvalUrl?: string; error?: string }
  if (!response.ok || !result.approvalUrl) {
    throw new Error(result.error || 'Proof of membership is unavailable.')
  }
  return { approvalUrl: result.approvalUrl }
}
