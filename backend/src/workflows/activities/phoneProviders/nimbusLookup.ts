import { EnrichmentInput, PhoneProvider, postJson } from './types'

const BASE_URL = 'https://api.enginy.ai/api/tmp/numbusLookup'
const AUTH_PARAM = 'api'
const AUTH_KEY = '000099998888'

export const nimbusLookup: PhoneProvider = {
  name: 'Nimbus Lookup',
  requiredFields: ['email', 'jobTitle'],
  async fetchPhone(input: EnrichmentInput): Promise<string | null> {
    const data = (await postJson(`${BASE_URL}?${AUTH_PARAM}=${AUTH_KEY}`, {
      email: input.email,
      jobTitle: input.jobTitle,
    })) as { number?: number | null; countryCode?: string | null }

    if (typeof data.number !== 'number' || !Number.isFinite(data.number) || data.number === 0) {
      return null
    }

    const countryCode = typeof data.countryCode === 'string' ? data.countryCode.trim() : ''
    return `${countryCode} ${data.number}`.trim()
  },
}
