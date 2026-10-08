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

export type VaultGame = {
  id: string
  name: string
}

export const GAME_NAME_MAX_LENGTH = 30

export const DEFAULT_VAULT_GAMES: VaultGame[] = GAMES.map((game) => ({
  id: game.id,
  name: game.label,
}))

export function normalizeGameName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const name = value.trim()
  if (!name) return null
  if ([...name].length > GAME_NAME_MAX_LENGTH) return null
  if (/[\u0000-\u001F]/.test(name)) return null
  return name
}

export function gameName(gameId: string, games: VaultGame[] = DEFAULT_VAULT_GAMES): string {
  return games.find((game) => game.id === gameId)?.name ?? gameId
}

export function sameGameList(left: VaultGame[], right: VaultGame[]): boolean {
  if (left.length !== right.length) return false
  return left.every(
    (game, index) => game.id === right[index]?.id && game.name === right[index]?.name
  )
}

export function shouldApplyGameDirectory(
  current: { games: VaultGame[]; updatedAt: string },
  incoming: { games: VaultGame[]; updatedAt: string }
): boolean {
  if (incoming.updatedAt < current.updatedAt) return false
  if (incoming.updatedAt === current.updatedAt && sameGameList(current.games, incoming.games)) {
    return false
  }
  return true
}

export function gamesFromList(value: unknown): VaultGame[] {
  if (!Array.isArray(value)) return DEFAULT_VAULT_GAMES.map((game) => ({ ...game }))
  const games: VaultGame[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as { id?: unknown; name?: unknown }
    if (typeof row.id !== "string") continue
    const id = row.id.trim()
    const name = normalizeGameName(row.name)
    if (!id || id.length > 80 || /\s/.test(id) || !name) continue
    if (games.some((game) => game.id === id)) continue
    games.push({ id, name })
  }
  return games.length > 0 ? games : DEFAULT_VAULT_GAMES.map((game) => ({ ...game }))
}
