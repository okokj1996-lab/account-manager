import { randomUUID } from "crypto"
import { promises as fs } from "fs"
import path from "path"
import { Redis } from "@upstash/redis"
import {
  DEFAULT_VAULT_GAMES,
  normalizeGameName,
  type VaultGame,
} from "@/lib/games"
import { acquireLock, releaseLock, type VaultLockClient } from "@/lib/vault-lock"

export const GAME_DIRECTORY_KEY = "olympus:vault:games"
export const GAME_DIRECTORY_LOCK_KEY = "olympus:vault:games:lock"

const VAULT_DIR = path.join(process.cwd(), ".data", "vault")
const GAMES_FILE = path.join(VAULT_DIR, "games.json")

export type GameDirectory = {
  games: VaultGame[]
  updatedAt: string
}

type StoredDirectory = {
  games: VaultGame[]
  updatedAt: string
}

export type GameWriteResult =
  | { ok: true; directory: GameDirectory }
  | {
      ok: false
      reason: "invalid-name" | "duplicate-name" | "missing" | "in-use" | "last-game" | "busy"
      accountCount?: number
    }

const writeTails = new Map<string, Promise<void>>()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const previous = writeTails.get(GAME_DIRECTORY_KEY) ?? Promise.resolve()
  const run = previous.then(task, task)
  writeTails.set(
    GAME_DIRECTORY_KEY,
    run.then(
      () => undefined,
      () => undefined
    )
  )
  return run
}

function redisFromEnv(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

function cloudMissing(): Error {
  return new Error(
    "CLOUD_STORE_MISSING: Vercel에서 Upstash Redis(KV)를 연결해야 공유 계정을 쓸 수 있습니다."
  )
}

function defaultDirectory(): GameDirectory {
  return {
    games: DEFAULT_VAULT_GAMES.map((game) => ({ ...game })),
    updatedAt: "",
  }
}

function parseDirectory(value: unknown): GameDirectory | null {
  if (!value || typeof value !== "object") return null
  const row = value as { games?: unknown; updatedAt?: unknown }
  if (!Array.isArray(row.games)) return null
  const games: VaultGame[] = []
  for (const item of row.games) {
    if (!item || typeof item !== "object") continue
    const game = item as { id?: unknown; name?: unknown }
    if (typeof game.id !== "string") continue
    const id = game.id.trim()
    const name = normalizeGameName(game.name)
    if (!id || id.length > 80 || /\s/.test(id) || !name) continue
    if (games.some((existing) => existing.id === id)) continue
    games.push({ id, name })
  }
  if (games.length === 0) return null
  return {
    games,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  }
}

function toStored(directory: GameDirectory): StoredDirectory {
  return {
    games: directory.games.map((game) => ({ id: game.id, name: game.name })),
    updatedAt: directory.updatedAt,
  }
}

function duplicateName(games: VaultGame[], name: string, exceptId?: string): boolean {
  const key = name.toLowerCase()
  return games.some((game) => game.id !== exceptId && game.name.toLowerCase() === key)
}

function createGameId(games: VaultGame[]): string {
  const ids = new Set(games.map((game) => game.id))
  let id = `game_${randomUUID()}`
  while (ids.has(id)) id = `game_${randomUUID()}`
  return id
}

async function readGamesFile(): Promise<GameDirectory | null> {
  try {
    const raw = await fs.readFile(GAMES_FILE, "utf8")
    return parseDirectory(JSON.parse(raw) as unknown)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

async function replaceGamesFile(directory: GameDirectory): Promise<void> {
  await fs.mkdir(VAULT_DIR, { recursive: true })
  const temp = path.join(VAULT_DIR, `.games.${process.pid}.tmp`)
  const backup = path.join(VAULT_DIR, `.games.${process.pid}.bak`)
  await fs.writeFile(temp, JSON.stringify(toStored(directory), null, 2), "utf8")
  let movedAside = false
  try {
    await fs.rename(GAMES_FILE, backup)
    movedAside = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  try {
    await fs.rename(temp, GAMES_FILE)
  } catch (error) {
    if (movedAside) await fs.rename(backup, GAMES_FILE).catch(() => undefined)
    throw error
  }
  if (movedAside) await fs.rm(backup, { force: true }).catch(() => undefined)
}

export async function readGameDirectory(): Promise<GameDirectory> {
  const redis = redisFromEnv()
  if (!redis && isServerlessRuntime()) throw cloudMissing()
  if (redis) {
    const value = await redis.get<unknown>(GAME_DIRECTORY_KEY)
    return parseDirectory(value) ?? defaultDirectory()
  }
  return (await readGamesFile()) ?? defaultDirectory()
}

export async function addGame(rawName: unknown): Promise<GameWriteResult> {
  const name = normalizeGameName(rawName)
  if (!name) return { ok: false, reason: "invalid-name" }
  return mutate((current) => {
    if (duplicateName(current.games, name)) return { ok: false, reason: "duplicate-name" }
    const directory: GameDirectory = {
      games: [...current.games, { id: createGameId(current.games), name }],
      updatedAt: new Date().toISOString(),
    }
    return { ok: true, directory }
  })
}

export async function renameGame(id: string, rawName: unknown): Promise<GameWriteResult> {
  const name = normalizeGameName(rawName)
  if (!name) return { ok: false, reason: "invalid-name" }
  return mutate((current) => {
    if (!current.games.some((game) => game.id === id)) return { ok: false, reason: "missing" }
    if (duplicateName(current.games, name, id)) return { ok: false, reason: "duplicate-name" }
    return {
      ok: true,
      directory: {
        games: current.games.map((game) => (game.id === id ? { ...game, name } : game)),
        updatedAt: new Date().toISOString(),
      },
    }
  })
}

export async function deleteGame(
  id: string,
  countAccounts: (gameId: string) => Promise<number>
): Promise<GameWriteResult> {
  return mutate(async (current) => {
    if (!current.games.some((game) => game.id === id)) return { ok: false, reason: "missing" }
    const accountCount = await countAccounts(id)
    if (accountCount > 0) return { ok: false, reason: "in-use", accountCount }
    if (current.games.length <= 1) return { ok: false, reason: "last-game" }
    return {
      ok: true,
      directory: {
        games: current.games.filter((game) => game.id !== id),
        updatedAt: new Date().toISOString(),
      },
    }
  })
}

async function mutate(
  change: (current: GameDirectory) => GameWriteResult | Promise<GameWriteResult>
): Promise<GameWriteResult> {
  const redis = redisFromEnv()
  if (!redis && isServerlessRuntime()) throw cloudMissing()
  return enqueue(() => (redis ? mutateRedis(redis, change) : mutateFile(change)))
}

async function mutateFile(
  change: (current: GameDirectory) => GameWriteResult | Promise<GameWriteResult>
): Promise<GameWriteResult> {
  const current = (await readGamesFile()) ?? defaultDirectory()
  const result = await change(current)
  if (!result.ok) return result
  await replaceGamesFile(result.directory)
  return result
}

async function mutateRedis(
  redis: Redis,
  change: (current: GameDirectory) => GameWriteResult | Promise<GameWriteResult>
): Promise<GameWriteResult> {
  const client = redis as VaultLockClient
  const token = await acquireLock(client, GAME_DIRECTORY_LOCK_KEY)
  if (!token) return { ok: false, reason: "busy" }
  try {
    const current = parseDirectory(await redis.get<unknown>(GAME_DIRECTORY_KEY)) ?? defaultDirectory()
    const result = await change(current)
    if (!result.ok) return result
    await redis.set(GAME_DIRECTORY_KEY, toStored(result.directory))
    return result
  } finally {
    await releaseLock(client, GAME_DIRECTORY_LOCK_KEY, token)
  }
}
