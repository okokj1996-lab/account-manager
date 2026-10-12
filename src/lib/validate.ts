import { normalizeGame } from "@/lib/games"
import { isMemberId, type MemberId } from "@/lib/members"
import {
  loginProviderLabel,
  normalizeLoginProvider,
  optionalAccountText,
  type ZeusAccount,
} from "@/lib/types"

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

function assignDetail(
  account: ZeusAccount,
  key: "loginProvider" | "characterClass" | "accountOwner",
  value: string | undefined
) {
  if (value) account[key] = value
  else delete account[key]
}

/** Keep every existing field. Missing or blank game becomes ZEUS. */
export function withGame(account: ZeusAccount): ZeusAccount {
  const next: ZeusAccount = {
    ...account,
    game: normalizeGame(account.game),
  }
  const source = account as ZeusAccount & {
    loginProvider?: unknown
    characterClass?: unknown
    accountOwner?: unknown
  }
  assignDetail(next, "loginProvider", normalizeLoginProvider(source.loginProvider))
  assignDetail(next, "characterClass", optionalAccountText(source.characterClass))
  assignDetail(next, "accountOwner", optionalAccountText(source.accountOwner))
  const manager = optionalAccountText(
    (source as { managedByMemberId?: unknown }).managedByMemberId
  )
  if (manager) next.managedByMemberId = manager
  else delete next.managedByMemberId
  return next
}

export function accountManagerId(account: ZeusAccount): MemberId | null {
  return isMemberId(account.managedByMemberId) ? account.managedByMemberId : null
}

export function groupAccountsByManager(accounts: ZeusAccount[]): {
  columns: Record<MemberId, ZeusAccount[]>
  unassigned: ZeusAccount[]
} {
  const columns: Record<MemberId, ZeusAccount[]> = {
    member1: [],
    member2: [],
    member3: [],
  }
  const unassigned: ZeusAccount[] = []
  for (const account of accounts) {
    const managerId = accountManagerId(account)
    if (managerId) columns[managerId].push(account)
    else unassigned.push(account)
  }
  return { columns, unassigned }
}

export function accountMatchesQuery(
  account: ZeusAccount,
  query: string,
  labels: string[] = []
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const fields = [
    account.username,
    account.characterName,
    account.server,
    account.notes,
    account.game,
    account.characterClass ?? "",
    account.accountOwner ?? "",
    account.loginProvider ?? "",
    loginProviderLabel(account.loginProvider),
    ...labels,
  ]
  return fields.some((field) => field.toLowerCase().includes(q))
}

export function filterAccounts(value: unknown): ZeusAccount[] {
  if (!Array.isArray(value)) return []
  return value.filter(isAccount).map(withGame)
}
