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
