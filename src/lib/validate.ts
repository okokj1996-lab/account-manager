import { normalizeGame } from "@/lib/games"
import type { ZeusAccount } from "@/lib/types"

export function isAccount(value: unknown): value is ZeusAccount {
  if (!value || typeof value !== "object") return false
  const a = value as Record<string, unknown>
  return (
    typeof a.id === "string" &&
    typeof a.username === "string" &&
    typeof a.password === "string" &&
    typeof a.characterName === "string" &&
    typeof a.server === "string" &&
    typeof a.level === "number" &&
    typeof a.status === "string" &&
    typeof a.notes === "string" &&
    typeof a.lastPlayedAt === "string" &&
    typeof a.createdAt === "string" &&
    typeof a.updatedAt === "string"
  )
}

/** Keep every existing field. Missing or blank game becomes ZEUS. */
export function withGame(account: ZeusAccount): ZeusAccount {
  return {
    ...account,
    game: normalizeGame(account.game),
  }
}

export function filterAccounts(value: unknown): ZeusAccount[] {
  if (!Array.isArray(value)) return []
  return value.filter(isAccount).map(withGame)
}
