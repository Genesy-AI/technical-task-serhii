import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { orionConnect } from './orionConnect'
import { astraDialer } from './astraDialer'
import { nimbusLookup } from './nimbusLookup'
import { hasRequiredFields, EnrichmentInput } from './types'

const fullInput: EnrichmentInput = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  jobTitle: 'CTO',
  companyName: 'Analytical Engines',
}

const mockFetch = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  })

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch({}))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('orionConnect', () => {
  it('sends the expected request', async () => {
    const fetchMock = mockFetch({ phone: '+1 555' })
    vi.stubGlobal('fetch', fetchMock)

    await orionConnect.fetchPhone(fullInput)

    expect(fetchMock).toHaveBeenCalledWith('https://api.enginy.ai/api/tmp/orionConnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-me': 'mySecretKey123',
      },
      body: JSON.stringify({ fullName: 'Ada Lovelace', companyWebsite: 'Analytical Engines' }),
    })
  })

  it('returns the phone when present', async () => {
    vi.stubGlobal('fetch', mockFetch({ phone: ' +1 555 123 ' }))
    expect(await orionConnect.fetchPhone(fullInput)).toBe('+1 555 123')
  })

  it('returns null when phone is null or empty', async () => {
    vi.stubGlobal('fetch', mockFetch({ phone: null }))
    expect(await orionConnect.fetchPhone(fullInput)).toBeNull()

    vi.stubGlobal('fetch', mockFetch({ phone: '' }))
    expect(await orionConnect.fetchPhone(fullInput)).toBeNull()
  })

  it('throws on non-2xx responses', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 500))
    await expect(orionConnect.fetchPhone(fullInput)).rejects.toThrow('status 500')
  })
})

describe('astraDialer', () => {
  it('sends the expected request', async () => {
    const fetchMock = mockFetch({ phoneNmbr: '123' })
    vi.stubGlobal('fetch', fetchMock)

    await astraDialer.fetchPhone(fullInput)

    expect(fetchMock).toHaveBeenCalledWith('https://api.enginy.ai/api/tmp/astraDialer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apiKey: '1234jhgf',
      },
      body: JSON.stringify({ email: 'ada@example.com' }),
    })
  })

  it('normalizes phoneNmbr to a phone or null', async () => {
    vi.stubGlobal('fetch', mockFetch({ phoneNmbr: '555-0001' }))
    expect(await astraDialer.fetchPhone(fullInput)).toBe('555-0001')

    vi.stubGlobal('fetch', mockFetch({ phoneNmbr: null }))
    expect(await astraDialer.fetchPhone(fullInput)).toBeNull()

    vi.stubGlobal('fetch', mockFetch({}))
    expect(await astraDialer.fetchPhone(fullInput)).toBeNull()
  })

  it('throws on non-2xx responses', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 429))
    await expect(astraDialer.fetchPhone(fullInput)).rejects.toThrow('status 429')
  })
})

describe('nimbusLookup', () => {
  it('sends the expected request with query param auth', async () => {
    const fetchMock = mockFetch({ number: 123, countryCode: '+44' })
    vi.stubGlobal('fetch', fetchMock)

    await nimbusLookup.fetchPhone(fullInput)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.enginy.ai/api/tmp/numbusLookup?api=000099998888',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ada@example.com', jobTitle: 'CTO' }),
      }
    )
  })

  it('combines countryCode and number', async () => {
    vi.stubGlobal('fetch', mockFetch({ number: 123456789, countryCode: '+44' }))
    expect(await nimbusLookup.fetchPhone(fullInput)).toBe('+44 123456789')
  })

  it('returns the number alone when countryCode is missing', async () => {
    vi.stubGlobal('fetch', mockFetch({ number: 123456789 }))
    expect(await nimbusLookup.fetchPhone(fullInput)).toBe('123456789')
  })

  it('returns null for missing, null, or zero number', async () => {
    vi.stubGlobal('fetch', mockFetch({ number: null, countryCode: 'US' }))
    expect(await nimbusLookup.fetchPhone(fullInput)).toBeNull()

    vi.stubGlobal('fetch', mockFetch({ number: 0, countryCode: 'US' }))
    expect(await nimbusLookup.fetchPhone(fullInput)).toBeNull()

    vi.stubGlobal('fetch', mockFetch({}))
    expect(await nimbusLookup.fetchPhone(fullInput)).toBeNull()
  })

  it('throws on non-2xx responses', async () => {
    vi.stubGlobal('fetch', mockFetch({}, false, 503))
    await expect(nimbusLookup.fetchPhone(fullInput)).rejects.toThrow('status 503')
  })
})

describe('hasRequiredFields', () => {
  it('returns true when all required fields are present', () => {
    expect(hasRequiredFields(orionConnect, fullInput)).toBe(true)
    expect(hasRequiredFields(astraDialer, fullInput)).toBe(true)
    expect(hasRequiredFields(nimbusLookup, fullInput)).toBe(true)
  })

  it('treats null and empty strings as missing', () => {
    expect(hasRequiredFields(orionConnect, { ...fullInput, companyName: null })).toBe(false)
    expect(hasRequiredFields(orionConnect, { ...fullInput, companyName: '  ' })).toBe(false)
    expect(hasRequiredFields(astraDialer, { ...fullInput, email: null })).toBe(false)
    expect(hasRequiredFields(nimbusLookup, { ...fullInput, jobTitle: '' })).toBe(false)
  })
})
