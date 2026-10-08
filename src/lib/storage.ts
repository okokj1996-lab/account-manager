import { STORAGE_KEY, type ZeusAccount } from "@/lib/types"
import { filterAccounts } from "@/lib/validate"

export const ROOM_STORAGE_KEY = "zeus-game-room-code-v1"

export function loadAccounts(): ZeusAccount[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return filterAccounts(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function saveAccounts(accounts: ZeusAccount[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

export function loadRoomCode(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ROOM_STORAGE_KEY)
}

export function saveRoomCode(code: string | null): void {
  if (typeof window === "undefined") return
  if (!code) {
    window.localStorage.removeItem(ROOM_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(ROOM_STORAGE_KEY, code)
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `acc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Merge personal accounts into a room list without dropping either side. */
export function mergeAccounts(
  personal: ZeusAccount[],
  room: ZeusAccount[]
): ZeusAccount[] {
  const byId = new Map<string, ZeusAccount>()
  const byUsername = new Map<string, string>()

  for (const account of room) {
    byId.set(account.id, account)
    byUsername.set(account.username.toLowerCase(), account.id)
  }

  for (const account of personal) {
    const existingId = byId.has(account.id)
      ? account.id
      : byUsername.get(account.username.toLowerCase())

    if (!existingId) {
      byId.set(account.id, account)
      byUsername.set(account.username.toLowerCase(), account.id)
      continue
    }

    const existing = byId.get(existingId)
    if (!existing) continue
    if (account.updatedAt >= existing.updatedAt) {
      if (existingId !== account.id) byId.delete(existingId)
      byId.set(account.id, account)
      byUsername.set(account.username.toLowerCase(), account.id)
    }
  }

  return Array.from(byId.values())
}
