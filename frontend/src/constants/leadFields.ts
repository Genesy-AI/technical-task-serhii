export interface LeadTemplateField {
  key: string
  label: string
}

export const LEAD_TEMPLATE_FIELDS: LeadTemplateField[] = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'countryCode', label: 'Country Code' },
  { key: 'phoneNumber', label: 'Phone Number' },
  { key: 'yearsAtCompany', label: 'Years at Company' },
  { key: 'linkedinUrl', label: 'LinkedIn URL' },
]
