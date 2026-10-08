export const GAMES = [
  { id: "ZEUS", label: "ZEUS", badge: "ZEUS" },
  { id: "SOL", label: "SOL: Enchant", badge: "SOL" },
  { id: "ODINQ", label: "오딘Q", badge: "오딘Q" },
  { id: "TEMPPAL", label: "템빨", badge: "템빨" },
] as const

export type GameId = (typeof GAMES)[number]["id"]

export const DEFAULT_GAME_ID: GameId = "ZEUS"

export function normalizeGame(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_GAME_ID
  const trimmed = value.trim()
  if (!trimmed) return DEFAULT_GAME_ID
  const lower = trimmed.toLowerCase()
  const found = GAMES.find(
    (game) =>
      game.id.toLowerCase() === lower ||
      game.label.toLowerCase() === lower ||
      game.badge.toLowerCase() === lower
  )
  return found ? found.id : trimmed
}

export function gameLabel(gameId: string): string {
  return GAMES.find((game) => game.id === gameId)?.label ?? gameId
}

export function gameBadge(gameId: string): string {
  return GAMES.find((game) => game.id === gameId)?.badge ?? gameId
}
