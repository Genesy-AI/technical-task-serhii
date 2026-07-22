export interface EnrichmentInput {
  fullName: string
  email: string | null
  jobTitle: string | null
  companyName: string | null
}

export interface PhoneProvider {
  name: string
  requiredFields: (keyof EnrichmentInput)[]
  fetchPhone(input: EnrichmentInput): Promise<string | null>
}

export function hasRequiredFields(provider: PhoneProvider, input: EnrichmentInput): boolean {
  return provider.requiredFields.every((field) => {
    const value = input[field]
    return typeof value === 'string' && value.trim() !== ''
  })
}

export async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Provider request to ${url} failed with status ${response.status}`)
  }

  return response.json()
}
