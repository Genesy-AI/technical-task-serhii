import { EnrichmentInput, PhoneProvider, postJson } from './types'

const BASE_URL = 'https://api.enginy.ai/api/tmp/astraDialer'
const AUTH_HEADER = 'apiKey'
const AUTH_KEY = '1234jhgf'

export const astraDialer: PhoneProvider = {
  name: 'Astra Dialer',
  requiredFields: ['email'],
  async fetchPhone(input: EnrichmentInput): Promise<string | null> {
    const data = (await postJson(
      BASE_URL,
      { email: input.email },
      { [AUTH_HEADER]: AUTH_KEY }
    )) as { phoneNmbr?: string | null }

    return typeof data.phoneNmbr === 'string' && data.phoneNmbr.trim() !== ''
      ? data.phoneNmbr.trim()
      : null
  },
}
