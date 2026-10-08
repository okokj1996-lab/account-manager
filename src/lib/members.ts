export const VAULT_MEMBER_STORAGE_KEY = "olympus-vault-member-id"

export const VAULT_MEMBERS = [
  { id: "member1", name: "상균" },
  { id: "member2", name: "재원" },
  { id: "member3", name: "선호" },
] as const

export type MemberId = (typeof VAULT_MEMBERS)[number]["id"]
export type MemberNames = Record<MemberId, string>

export const MEMBER_NAME_MAX_LENGTH = 20

export const DEFAULT_MEMBER_NAMES: MemberNames = {
  member1: "상균",
  member2: "재원",
  member3: "선호",
}

export function isMemberId(value: unknown): value is MemberId {
  return typeof value === "string" && VAULT_MEMBERS.some((member) => member.id === value)
}

export function memberName(id: MemberId, names: MemberNames = DEFAULT_MEMBER_NAMES): string {
  const name = names[id]?.trim()
  return name || DEFAULT_MEMBER_NAMES[id]
}

export function normalizeMemberName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const name = value.trim()
  if (!name) return null
  if ([...name].length > MEMBER_NAME_MAX_LENGTH) return null
  if (/[\u0000-\u001F]/.test(name)) return null
  return name
}

export function sameMemberNames(left: MemberNames, right: MemberNames): boolean {
  return (
    left.member1 === right.member1 &&
    left.member2 === right.member2 &&
    left.member3 === right.member3
  )
}

export function memberNamesFromList(value: unknown): MemberNames {
  const names = { ...DEFAULT_MEMBER_NAMES }
  if (!Array.isArray(value)) return names
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as { id?: unknown; name?: unknown }
    if (!isMemberId(row.id)) continue
    const name = normalizeMemberName(row.name)
    if (name) names[row.id] = name
  }
  return names
}

export function shouldApplyMemberDirectory(
  current: { names: MemberNames; updatedAt: string },
  incoming: { names: MemberNames; updatedAt: string }
): boolean {
  if (incoming.updatedAt < current.updatedAt) return false
  if (
    incoming.updatedAt === current.updatedAt &&
    sameMemberNames(current.names, incoming.names)
  ) {
    return false
  }
  return true
}

export function readStoredMemberId(): MemberId | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(VAULT_MEMBER_STORAGE_KEY)
    if (isMemberId(raw)) return raw
    if (raw !== null) window.localStorage.removeItem(VAULT_MEMBER_STORAGE_KEY)
    return null
  } catch {
    return null
  }
}

export function storeMemberId(id: MemberId) {
  window.localStorage.setItem(VAULT_MEMBER_STORAGE_KEY, id)
}

export function clearStoredMemberId() {
  window.localStorage.removeItem(VAULT_MEMBER_STORAGE_KEY)
}
