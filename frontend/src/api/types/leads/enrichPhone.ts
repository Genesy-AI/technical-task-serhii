export type LeadsEnrichPhoneInput = {
  leadIds: number[]
}

export type LeadsEnrichPhoneOutput = {
  success: boolean
  startedCount: number
  alreadyRunning: number[]
  notFound: number[]
  errors: Array<{
    leadId: number
    error: string
  }>
}
