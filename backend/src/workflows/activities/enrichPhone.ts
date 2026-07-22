import { PrismaClient, Prisma } from '@prisma/client'
import { ApplicationFailure } from '@temporalio/common'
import { EnrichmentInput, hasRequiredFields, orionConnect, astraDialer, nimbusLookup } from './phoneProviders'

const prisma = new PrismaClient()

export async function getLeadEnrichmentInput(leadId: number): Promise<EnrichmentInput> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })

  if (!lead) {
    throw ApplicationFailure.nonRetryable(`Lead ${leadId} not found`, 'LeadNotFound')
  }

  return {
    fullName: `${lead.firstName} ${lead.lastName}`.trim(),
    email: lead.email,
    jobTitle: lead.jobTitle,
    companyName: lead.companyName,
  }
}

export async function callOrionConnect(input: EnrichmentInput): Promise<string | null> {
  if (!hasRequiredFields(orionConnect, input)) return null
  return orionConnect.fetchPhone(input)
}

export async function callAstraDialer(input: EnrichmentInput): Promise<string | null> {
  if (!hasRequiredFields(astraDialer, input)) return null
  return astraDialer.fetchPhone(input)
}

export async function callNimbusLookup(input: EnrichmentInput): Promise<string | null> {
  if (!hasRequiredFields(nimbusLookup, input)) return null
  return nimbusLookup.fetchPhone(input)
}

export async function savePhoneEnrichmentResult(params: {
  leadId: number
  phoneNumber: string | null
  status: 'COMPLETED' | 'NO_DATA' | 'FAILED'
}): Promise<void> {
  try {
    await prisma.lead.update({
      where: { id: params.leadId },
      data: {
        phoneEnrichmentStatus: params.status,
        ...(params.phoneNumber !== null ? { phoneNumber: params.phoneNumber } : {}),
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return
    }
    throw error
  }
}
