import { z } from 'zod'
import { id, month } from './workspace'
import { deploymentModelRef } from './model'

export const domains = { goals: 1, notes: 2, finance: 4 }
export const attachment = z.strictObject({ kind: z.enum(['goal', 'note']), id })
export const modelRef = z.union([id, z.literal(deploymentModelRef)])
export const pageContext = z.strictObject({
  page: z.enum(['dashboard', 'goals', 'finance', 'notes', 'chats', 'settings']),
  entityId: id.optional(),
  selectedMonth: month.optional()
})
export const sendInput = z.strictObject({
  clientMessageId: id,
  conversationId: id.optional(),
  modelRef: modelRef.optional(),
  text: z.string().trim().min(1).refine(value => [...value].length <= 12000),
  pageContext: pageContext.optional(),
  attachments: z.array(attachment).max(4).default([])
})
export type SendInput = z.infer<typeof sendInput>
export type Attachment = z.infer<typeof attachment> & { label: string }
export type Chat = { id: string; title: string; updated_at: number; version: number; runId?: string | null }
export type Source = { kind: 'goal' | 'note' | 'finance' | 'page'; label: string; href: string }
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
export type Message = {
  id: string; role: 'user' | 'assistant'; text: string; state: RunStatus; created_at: number
  runId: string | null; errorCode: string | null; proposalId: string | null; sources: Source[]
}
export type RunReceipt = { runId: string; conversationId: string; messageId: string }
export type RunSnapshot = RunReceipt & { status: RunStatus; text: string; sources: Source[]; errorCode: string | null; proposalId: string | null }
export type Proposal = {
  id: string; status: 'pending' | 'applied' | 'rejected' | 'expired' | 'invalidated'
  preview: { label: string; before: string; after: string; href: string }
  expires_at: number
}
