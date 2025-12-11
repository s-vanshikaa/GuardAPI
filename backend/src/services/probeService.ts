import axios from 'axios'

export interface ProbeResult {
  success: boolean
  httpStatus: number | null
  latencyMs: number
  errorType: string | null
  responseData: unknown
}

function classifyError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') return 'TIMEOUT'
    if (err.code === 'ECONNREFUSED') return 'CONNECTION_REFUSED'
    if (err.code === 'ENOTFOUND') return 'DNS_ERROR'
  }
  return 'NETWORK_ERROR'
}

export async function probeEndpoint(
  endpointUrl: string,
  expectedStatus: number,
  timeoutMs = 10_000,
): Promise<ProbeResult> {
  const startedAt = Date.now()

  try {
    const response = await axios.get(endpointUrl, {
      timeout: timeoutMs,
      validateStatus: () => true,
      headers: { 'User-Agent': 'GuardAPI/1.0' },
    })

    return {
      success: response.status === expectedStatus,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      errorType: response.status === expectedStatus ? null : 'UNEXPECTED_STATUS',
      responseData: response.data,
    }
  } catch (err) {
    return {
      success: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      errorType: classifyError(err),
      responseData: null,
    }
  }
}
