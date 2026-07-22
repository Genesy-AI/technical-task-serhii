import { EnrichmentInput, PhoneProvider, postJson } from './types'

const BASE_URL = 'https://api.enginy.ai/api/tmp/orionConnect'
const AUTH_HEADER = 'x-auth-me'
const AUTH_KEY = 'mySecretKey123'

export const orionConnect: PhoneProvider = {
  name: 'Orion Connect',
  requiredFields: ['fullName', 'companyName'],
  async fetchPhone(input: EnrichmentInput): Promise<string | null> {
    const data = (await postJson(
      BASE_URL,
      {
        fullName: input.fullName,
        companyWebsite: input.companyName,
      },
      { [AUTH_HEADER]: AUTH_KEY }
    )) as { phone?: string | null }

    return typeof data.phone === 'string' && data.phone.trim() !== '' ? data.phone.trim() : null
  },
}
