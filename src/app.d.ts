import type { Preferences } from '#lib/contracts/workspace'

declare global {
  namespace App {
    interface Locals {
      user: { id: string; username: string } | null
      sessionHash: string | null
      preferences?: Preferences
    }
  }
}

export {}
