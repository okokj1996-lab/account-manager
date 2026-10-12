import type { MemberId } from "@/lib/members"

export type AccountStatus = "active" | "resting" | "banned" | "shared"
export type UsageStatus = "available" | "in_use"

export interface ZeusAccount {
  id: string
  game: string
  username: string
  password: string
  characterName: string
  server: string
  level: number
  status: AccountStatus
  notes: string
  lastPlayedAt: string
  createdAt: string
  updatedAt: string
  loginProvider?: string
  characterClass?: string
  accountOwner?: string
  managedByMemberId?: string
  usageStatus?: UsageStatus
  currentUserId?: MemberId
  usageStartedAt?: string
  lastUsedBy?: MemberId
  lastUsedAt?: string
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "활성",
  resting: "휴면",
  banned: "정지",
  shared: "공유",
}

export const STORAGE_KEY = "zeus-game-accounts-v1"

export const LOGIN_PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
  { id: "facebook", label: "Facebook" },
  { id: "game", label: "게임사 계정" },
  { id: "other", label: "기타" },
] as const

export function optionalAccountText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function normalizeLoginProvider(value: unknown): string | undefined {
  const trimmed = optionalAccountText(value)
  if (!trimmed) return undefined
  const byId = LOGIN_PROVIDERS.find((item) => item.id === trimmed.toLowerCase())
  if (byId) return byId.id
  const byLabel = LOGIN_PROVIDERS.find(
    (item) => item.label.toLowerCase() === trimmed.toLowerCase()
  )
  if (byLabel) return byLabel.id
  return trimmed
}

export function loginProviderLabel(value?: string): string {
  if (!value) return ""
  const known = LOGIN_PROVIDERS.find((item) => item.id === value)
  return known?.label ?? value
}
