import { Connection, Client } from '@temporalio/client'

let clientPromise: Promise<Client> | null = null

export function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Connection.connect({ address: 'localhost:7233' })
      .then((connection) => new Client({ connection, namespace: 'default' }))
      .catch((error) => {
        clientPromise = null
        throw error
      })
  }
  return clientPromise
}
