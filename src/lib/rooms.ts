import { promises as fs } from "fs"
import path from "path"
import { Redis } from "@upstash/redis"
import type { ZeusAccount } from "@/lib/types"
import { filterAccounts } from "@/lib/validate"

export type RoomData = {
  code: string
  createdAt: string
  updatedAt: string
  accounts: ZeusAccount[]
}

const DATA_DIR = path.join(process.cwd(), ".data", "rooms")
const ROOM_PREFIX = "zeus:room:"

function roomPath(code: string): string {
  return path.join(DATA_DIR, `${code}.json`)
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (code.length < 4 || code.length > 12) return null
  return code
}

export function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

function redisFromEnv(): Redis | null {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export function hasCloudRoomStore(): boolean {
  return redisFromEnv() !== null
}

export function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

function parseRoom(value: unknown, code: string): RoomData | null {
  if (!value || typeof value !== "object") return null
  const parsed = value as RoomData
  if (parsed.code !== code) return null
  return {
    code,
    createdAt: String(parsed.createdAt ?? ""),
    updatedAt: String(parsed.updatedAt ?? ""),
    accounts: filterAccounts(parsed.accounts),
  }
}

async function createRoomFile(accounts: ZeusAccount[]): Promise<RoomData> {
  await ensureDataDir()
  let code = createRoomCode()
  for (let i = 0; i < 5; i += 1) {
    try {
      await fs.access(roomPath(code))
      code = createRoomCode()
    } catch {
      break
    }
  }
  const now = new Date().toISOString()
  const room: RoomData = {
    code,
    createdAt: now,
    updatedAt: now,
    accounts: filterAccounts(accounts),
  }
  await fs.writeFile(roomPath(code), JSON.stringify(room, null, 2), "utf8")
  return room
}

async function readRoomFile(code: string): Promise<RoomData | null> {
  try {
    const raw = await fs.readFile(roomPath(code), "utf8")
    return parseRoom(JSON.parse(raw) as unknown, code)
  } catch {
    return null
  }
}

async function writeRoomFile(
  code: string,
  accounts: ZeusAccount[]
): Promise<RoomData | null> {
  const existing = await readRoomFile(code)
  if (!existing) return null
  const room: RoomData = {
    ...existing,
    updatedAt: new Date().toISOString(),
    accounts: filterAccounts(accounts),
  }
  await fs.writeFile(roomPath(room.code), JSON.stringify(room, null, 2), "utf8")
  return room
}

async function createRoomRedis(
  redis: Redis,
  accounts: ZeusAccount[]
): Promise<RoomData> {
  let code = createRoomCode()
  for (let i = 0; i < 8; i += 1) {
    const exists = await redis.exists(`${ROOM_PREFIX}${code}`)
    if (!exists) break
    code = createRoomCode()
  }
  const now = new Date().toISOString()
  const room: RoomData = {
    code,
    createdAt: now,
    updatedAt: now,
    accounts: filterAccounts(accounts),
  }
  await redis.set(`${ROOM_PREFIX}${code}`, room)
  return room
}

async function readRoomRedis(
  redis: Redis,
  code: string
): Promise<RoomData | null> {
  const value = await redis.get<RoomData>(`${ROOM_PREFIX}${code}`)
  return parseRoom(value, code)
}

async function writeRoomRedis(
  redis: Redis,
  code: string,
  accounts: ZeusAccount[]
): Promise<RoomData | null> {
  const existing = await readRoomRedis(redis, code)
  if (!existing) return null
  const room: RoomData = {
    ...existing,
    updatedAt: new Date().toISOString(),
    accounts: filterAccounts(accounts),
  }
  await redis.set(`${ROOM_PREFIX}${code}`, room)
  return room
}

export async function createRoom(accounts: ZeusAccount[]): Promise<RoomData> {
  const redis = redisFromEnv()
  if (redis) return createRoomRedis(redis, accounts)
  if (isServerlessRuntime()) {
    throw new Error(
      "CLOUD_STORE_MISSING: Vercel에서 Upstash Redis(KV)를 연결해야 공유 방을 쓸 수 있습니다."
    )
  }
  return createRoomFile(accounts)
}

export async function readRoom(code: string): Promise<RoomData | null> {
  const normalized = normalizeRoomCode(code)
  if (!normalized) return null
  const redis = redisFromEnv()
  if (redis) return readRoomRedis(redis, normalized)
  if (isServerlessRuntime()) return null
  return readRoomFile(normalized)
}

export async function writeRoom(
  code: string,
  accounts: ZeusAccount[]
): Promise<RoomData | null> {
  const normalized = normalizeRoomCode(code)
  if (!normalized) return null
  const redis = redisFromEnv()
  if (redis) return writeRoomRedis(redis, normalized, accounts)
  if (isServerlessRuntime()) return null
  return writeRoomFile(normalized, accounts)
}
