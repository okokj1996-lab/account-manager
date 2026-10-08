export type AccountStatus = "active" | "resting" | "banned" | "shared"

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
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "사용 중",
  resting: "휴면",
  banned: "정지",
  shared: "공유",
}

export const SERVER_OPTIONS = [
  "올림푸스-1",
  "올림푸스-2",
  "폭풍의 요새",
  "번개의 전장",
  "크로노스",
] as const

export const STORAGE_KEY = "zeus-game-accounts-v1"
