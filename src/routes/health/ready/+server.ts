import { database } from '#lib/server/db'

export async function GET() {
  try {
    await database('ready')
    return new Response('ok')
  } catch {
    return new Response('unavailable', { status: 503 })
  }
}
