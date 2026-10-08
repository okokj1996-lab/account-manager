import { STORAGE_KEY, type ZeusAccount } from "@/lib/types"
import { preserveAccountUsage } from "@/lib/usage"
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

function accountMatchKey(account: ZeusAccount): string {
  return `${account.game}\n${account.username.toLowerCase()}`
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
    byUsername.set(accountMatchKey(account), account.id)
  }

  for (const account of personal) {
    const existingId = byId.has(account.id)
      ? account.id
      : byUsername.get(accountMatchKey(account))

    if (!existingId) {
      byId.set(account.id, account)
      byUsername.set(accountMatchKey(account), account.id)
      continue
    }

    const existing = byId.get(existingId)
    if (!existing) continue
    if (account.updatedAt >= existing.updatedAt) {
      if (existingId !== account.id) byId.delete(existingId)
      byId.set(account.id, account)
      byUsername.set(accountMatchKey(account), account.id)
    }
  }

  return Array.from(byId.values())
}

function sameAccount(a?: ZeusAccount, b?: ZeusAccount): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.game === b.game &&
    a.username === b.username &&
    a.password === b.password &&
    a.characterName === b.characterName &&
    a.server === b.server &&
    a.level === b.level &&
    a.status === b.status &&
    a.notes === b.notes &&
    a.lastPlayedAt === b.lastPlayedAt &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt
  )
}

export function sameAccountList(
  left: ZeusAccount[],
  right: ZeusAccount[]
): boolean {
  if (left.length !== right.length) return false
  const byId = new Map(right.map((account) => [account.id, account]))
  return left.every((account) => sameAccount(account, byId.get(account.id)))
}

/**
 * Combine two edits of the same room.
 * baseline is the server list both edits started from.
 * A delete stays deleted unless the other side changed that same account.
 */
export function mergeRoomEdits(
  baseline: ZeusAccount[],
  local: ZeusAccount[],
  server: ZeusAccount[]
): ZeusAccount[] {
  const base = new Map(baseline.map((account) => [account.id, account]))
  const mine = new Map(local.map((account) => [account.id, account]))
  const theirs = new Map(server.map((account) => [account.id, account]))
  const ids = new Set<string>([
    ...base.keys(),
    ...mine.keys(),
    ...theirs.keys(),
  ])
  const merged: ZeusAccount[] = []

  for (const id of ids) {
    const before = base.get(id)
    const localAccount = mine.get(id)
    const serverAccount = theirs.get(id)
    const localChanged = !sameAccount(before, localAccount)
    const serverChanged = !sameAccount(before, serverAccount)

    if (!localChanged && !serverChanged) {
      if (localAccount) merged.push(preserveAccountUsage(localAccount, serverAccount))
      continue
    }
    if (localChanged && !serverChanged) {
      if (localAccount) merged.push(preserveAccountUsage(localAccount, serverAccount))
      continue
    }
    if (!localChanged && serverChanged) {
      if (serverAccount) merged.push(serverAccount)
      continue
    }
    if (!localAccount && !serverAccount) continue
    if (!localAccount) {
      if (serverAccount) merged.push(serverAccount)
      continue
    }
    if (!serverAccount) {
      merged.push(preserveAccountUsage(localAccount))
      continue
    }
    const winner =
      localAccount.updatedAt >= serverAccount.updatedAt ? localAccount : serverAccount
    merged.push(preserveAccountUsage(winner, serverAccount))
  }

  return merged
}
