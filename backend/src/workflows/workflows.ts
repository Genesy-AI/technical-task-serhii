import { proxyActivities, ActivityFailure } from '@temporalio/workflow'
import type { RetryPolicy } from '@temporalio/common'
import type * as activities from './activities'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3 },
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}

const providerRetry: RetryPolicy = {
  maximumAttempts: 3,
  initialInterval: '1 second',
  backoffCoefficient: 2,
  maximumInterval: '10 seconds',
}

const { callOrionConnect } = proxyActivities<typeof activities>({
  startToCloseTimeout: '15 seconds',
  retry: providerRetry,
})

const { callAstraDialer } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 seconds',
  retry: providerRetry,
})

const { callNimbusLookup } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: providerRetry,
})

const { getLeadEnrichmentInput, savePhoneEnrichmentResult } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 seconds',
  retry: { maximumAttempts: 5 },
})

export interface EnrichPhoneResult {
  status: 'COMPLETED' | 'NO_DATA' | 'FAILED'
  phoneNumber: string | null
}

export async function enrichPhoneWorkflow(leadId: number): Promise<EnrichPhoneResult> {
  try {
    const input = await getLeadEnrichmentInput(leadId)
    const providers = [callOrionConnect, callAstraDialer, callNimbusLookup]

    for (const callProvider of providers) {
      let phoneNumber: string | null = null

      try {
        phoneNumber = await callProvider(input)
      } catch (error) {
        if (!(error instanceof ActivityFailure)) {
          throw error
        }
      }

      if (phoneNumber) {
        await savePhoneEnrichmentResult({ leadId, phoneNumber, status: 'COMPLETED' })
        return { status: 'COMPLETED', phoneNumber }
      }
    }

    await savePhoneEnrichmentResult({ leadId, phoneNumber: null, status: 'NO_DATA' })
    return { status: 'NO_DATA', phoneNumber: null }
  } catch (error) {
    try {
      await savePhoneEnrichmentResult({ leadId, phoneNumber: null, status: 'FAILED' })
    } catch {}
    throw error
  }
}
