import { promises as fs } from "fs"
import path from "path"
import { Redis } from "@upstash/redis"
import {
  decryptPassword,
  encryptPassword,
  isEncryptedPassword,
  isEncryptionKeyConfigured,
  type EncryptedPassword,
} from "@/lib/password-crypto"
import type { MemberId } from "@/lib/members"
import type { ZeusAccount } from "@/lib/types"
import { decideUsage, preserveUsageList, type UsageAction } from "@/lib/usage"
import { filterAccounts } from "@/lib/validate"
import {
  acquireVaultLock,
  releaseVaultLock,
  type VaultLockClient,
} from "@/lib/vault-lock"

export type RoomData = {
  code: string
  createdAt: string
  updatedAt: string
  accounts: ZeusAccount[]
}

type StoredAccount = Omit<ZeusAccount, "password"> & {
  password: EncryptedPassword | string
}

type StoredRoom = {
  code: string
  createdAt: string
  updatedAt: string
  accounts: StoredAccount[]
}

type ParsedRoom = {
  room: RoomData
  needsMigration: boolean
}

const DATA_DIR = path.join(process.cwd(), ".data", "rooms")
const ROOM_PREFIX = "zeus:room:"

export type RoomWriteResult =
  | { ok: true; room: RoomData }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "conflict"; room: RoomData }

const roomWriteTails = new Map<string, Promise<void>>()

function enqueueRoomWrite<T>(code: string, task: () => Promise<T>): Promise<T> {
  const previous = roomWriteTails.get(code) ?? Promise.resolve()
  const run = previous.then(task, task)
  roomWriteTails.set(
    code,
    run.then(
      () => undefined,
      () => undefined
    )
  )
  return run
}

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

function hasPlaintextPassword(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const accounts = (value as { accounts?: unknown }).accounts
  if (!Array.isArray(accounts)) return false
  return accounts.some(
    (item) =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as { password?: unknown }).password === "string"
  )
}

function openStoredAccounts(value: unknown): {
  accounts: unknown
  needsMigration: boolean
} {
  if (!Array.isArray(value)) return { accounts: value, needsMigration: false }
  let needsMigration = false
  const accounts = value.map((item) => {
    if (!item || typeof item !== "object") return item
    const row = item as Record<string, unknown>
    const password = row.password
    if (typeof password === "string") {
      needsMigration = true
      return item
    }
    if (isEncryptedPassword(password)) {
      return { ...row, password: decryptPassword(password) }
    }
    if (password !== undefined) throw new Error("ENCRYPTION_DECRYPT_FAILED")
    return item
  })
  return { accounts, needsMigration }
}

function parseRoom(value: unknown, code: string): ParsedRoom | null {
  if (!value || typeof value !== "object") return null
  const parsed = value as {
    code?: unknown
    createdAt?: unknown
    updatedAt?: unknown
    accounts?: unknown
  }
  if (parsed.code !== code) return null
  const opened = openStoredAccounts(parsed.accounts)
  return {
    needsMigration: opened.needsMigration,
    room: {
      code,
      createdAt: String(parsed.createdAt ?? ""),
      updatedAt: String(parsed.updatedAt ?? ""),
      accounts: filterAccounts(opened.accounts),
    },
  }
}

function toStoredRoom(room: RoomData): StoredRoom {
  return {
    code: room.code,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    accounts: room.accounts.map((account) => ({
      ...account,
      password: encryptPassword(account.password),
    })),
  }
}

function sealRawPasswords(value: unknown): StoredRoom {
  if (!value || typeof value !== "object") {
    throw new Error("ENCRYPTION_FAILED")
  }
  const room = value as StoredRoom
  if (!Array.isArray(room.accounts)) throw new Error("ENCRYPTION_FAILED")
  return {
    ...room,
    accounts: room.accounts.map((account) => {
      if (!account || typeof account !== "object") return account
      if (typeof account.password !== "string") return account
      return {
        ...account,
        password: encryptPassword(account.password),
      }
    }),
  }
}

function buildRoom(code: string, accounts: ZeusAccount[]): RoomData {
  const now = new Date().toISOString()
  return {
    code,
    createdAt: now,
    updatedAt: now,
    accounts: filterAccounts(accounts),
  }
}

async function writeNewRoomFile(room: StoredRoom): Promise<boolean> {
  try {
    await fs.writeFile(roomPath(room.code), JSON.stringify(room, null, 2), {
      encoding: "utf8",
      flag: "wx",
    })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false
    throw error
  }
}

async function replaceRoomFile(room: StoredRoom): Promise<void> {
  await ensureDataDir()
  const target = roomPath(room.code)
  const temp = path.join(DATA_DIR, `.${room.code}.${process.pid}.tmp`)
  const backup = path.join(DATA_DIR, `.${room.code}.${process.pid}.bak`)
  await fs.writeFile(temp, JSON.stringify(room, null, 2), "utf8")
  let movedAside = false
  try {
    await fs.rename(target, backup)
    movedAside = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  try {
    await fs.rename(temp, target)
  } catch (error) {
    if (movedAside) {
      await fs.rename(backup, target).catch(() => undefined)
    }
    throw error
  }
  if (movedAside) {
    await fs.rm(backup, { force: true }).catch(() => undefined)
  }
}

async function createRoomFile(
  accounts: ZeusAccount[],
  preferredCode: string | null
): Promise<RoomData> {
  await ensureDataDir()
  const plainAccounts = filterAccounts(accounts)
  const sealedAccounts = plainAccounts.map((account) => ({
    ...account,
    password: encryptPassword(account.password),
  }))

  if (preferredCode) {
    const room = buildRoom(preferredCode, plainAccounts)
    const stored: StoredRoom = { ...room, accounts: sealedAccounts }
    if (!(await writeNewRoomFile(stored))) {
      throw new Error("ROOM_CODE_TAKEN")
    }
    return room
  }

  for (let i = 0; i < 8; i += 1) {
    const room = buildRoom(createRoomCode(), plainAccounts)
    const stored: StoredRoom = { ...room, accounts: sealedAccounts }
    if (await writeNewRoomFile(stored)) return room
  }
  throw new Error("ROOM_CREATE_FAILED")
}

async function readRoomFile(code: string): Promise<ParsedRoom | null> {
  let raw: string
  try {
    raw = await fs.readFile(roomPath(code), "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
  return parseRoom(JSON.parse(raw) as unknown, code)
}

async function writeRoomFile(
  code: string,
  accounts: ZeusAccount[],
  baseUpdatedAt?: string
): Promise<RoomWriteResult> {
  return enqueueRoomWrite(code, async () => {
    const existing = await readRoomFile(code)
    if (!existing) return { ok: false, reason: "missing" }
    if (baseUpdatedAt && existing.room.updatedAt !== baseUpdatedAt) {
      return { ok: false, reason: "conflict", room: existing.room }
    }
    const room: RoomData = {
      ...existing.room,
      updatedAt: new Date().toISOString(),
      accounts: filterAccounts(accounts),
    }
    await replaceRoomFile(toStoredRoom(room))
    return { ok: true, room }
  })
}

async function migratePlaintextFile(
  code: string,
  seenUpdatedAt: string
): Promise<void> {
  if (!isEncryptionKeyConfigured()) return
  await enqueueRoomWrite(code, async () => {
    let raw: string
    try {
      raw = await fs.readFile(roomPath(code), "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    const stored = JSON.parse(raw) as { code?: unknown; updatedAt?: unknown }
    if (stored.code !== code || stored.updatedAt !== seenUpdatedAt) return
    if (!hasPlaintextPassword(stored)) return
    await replaceRoomFile(sealRawPasswords(stored))
  })
}

async function writeNewRoomRedis(
  redis: Redis,
  room: StoredRoom
): Promise<boolean> {
  const saved = await redis.set(`${ROOM_PREFIX}${room.code}`, room, {
    nx: true,
  })
  return saved === "OK"
}

async function createRoomRedis(
  redis: Redis,
  accounts: ZeusAccount[],
  preferredCode: string | null
): Promise<RoomData> {
  const plainAccounts = filterAccounts(accounts)
  const sealedAccounts = plainAccounts.map((account) => ({
    ...account,
    password: encryptPassword(account.password),
  }))

  if (preferredCode) {
    const room = buildRoom(preferredCode, plainAccounts)
    const stored: StoredRoom = { ...room, accounts: sealedAccounts }
    if (!(await writeNewRoomRedis(redis, stored))) {
      throw new Error("ROOM_CODE_TAKEN")
    }
    return room
  }

  for (let i = 0; i < 8; i += 1) {
    const room = buildRoom(createRoomCode(), plainAccounts)
    const stored: StoredRoom = { ...room, accounts: sealedAccounts }
    if (await writeNewRoomRedis(redis, stored)) return room
  }
  throw new Error("ROOM_CREATE_FAILED")
}

async function readRoomRedis(
  redis: Redis,
  code: string
): Promise<ParsedRoom | null> {
  const value = await redis.get<unknown>(`${ROOM_PREFIX}${code}`)
  if (value == null) return null
  return parseRoom(value, code)
}

async function migratePlaintextRedis(
  redis: Redis,
  code: string,
  seenUpdatedAt: string
): Promise<void> {
  if (!isEncryptionKeyConfigured()) return
  await enqueueRoomWrite(code, async () => {
    const key = `${ROOM_PREFIX}${code}`
    const lockKey = `${key}:lock`
    const locked = await redis.set(lockKey, "1", { nx: true, ex: 5 })
    if (locked !== "OK") return
    try {
      const stored = await redis.get<unknown>(key)
      if (!stored || typeof stored !== "object") return
      const record = stored as { code?: unknown; updatedAt?: unknown }
      if (record.code !== code || record.updatedAt !== seenUpdatedAt) return
      if (!hasPlaintextPassword(stored)) return
      await redis.set(key, sealRawPasswords(stored))
    } finally {
      try {
        await redis.del(lockKey)
      } catch {
        // The lock expires after 5 seconds if delete fails.
      }
    }
  })
}

async function writeRoomRedis(
  redis: Redis,
  code: string,
  accounts: ZeusAccount[],
  baseUpdatedAt?: string
): Promise<RoomWriteResult> {
  return enqueueRoomWrite(code, async () => {
    const key = `${ROOM_PREFIX}${code}`
    const lockKey = `${key}:lock`
    const locked = await redis.set(lockKey, "1", { nx: true, ex: 5 })
    if (locked !== "OK") {
      const current = await readRoomRedis(redis, code)
      if (!current) return { ok: false, reason: "missing" }
      return { ok: false, reason: "conflict", room: current.room }
    }
    try {
      const existing = await readRoomRedis(redis, code)
      if (!existing) return { ok: false, reason: "missing" }
      if (baseUpdatedAt && existing.room.updatedAt !== baseUpdatedAt) {
        return { ok: false, reason: "conflict", room: existing.room }
      }
      const room: RoomData = {
        ...existing.room,
        updatedAt: new Date().toISOString(),
        accounts: filterAccounts(accounts),
      }
      await redis.set(key, toStoredRoom(room))
      return { ok: true, room }
    } finally {
      try {
        await redis.del(lockKey)
      } catch {
        // The lock expires after 5 seconds if delete fails.
      }
    }
  })
}

export async function createRoom(
  accounts: ZeusAccount[],
  preferredCode?: string
): Promise<RoomData> {
  let code: string | null = null
  if (preferredCode !== undefined && preferredCode.trim() !== "") {
    code = normalizeRoomCode(preferredCode)
    if (!code) throw new Error("INVALID_ROOM_CODE")
  }

  const redis = redisFromEnv()
  if (redis) return createRoomRedis(redis, accounts, code)
  if (isServerlessRuntime()) {
    throw new Error(
      "CLOUD_STORE_MISSING: Vercel에서 Upstash Redis(KV)를 연결해야 공유 방을 쓸 수 있습니다."
    )
  }
  return createRoomFile(accounts, code)
}

export async function readRoom(code: string): Promise<RoomData | null> {
  const normalized = normalizeRoomCode(code)
  if (!normalized) return null
  const redis = redisFromEnv()
  const parsed = redis
    ? await readRoomRedis(redis, normalized)
    : isServerlessRuntime()
      ? null
      : await readRoomFile(normalized)
  if (!parsed) return null
  if (parsed.needsMigration && isEncryptionKeyConfigured()) {
    try {
      if (redis) await migratePlaintextRedis(redis, normalized, parsed.room.updatedAt)
      else await migratePlaintextFile(normalized, parsed.room.updatedAt)
    } catch (error) {
      console.error(
        "[rooms] password migration skipped",
        error instanceof Error ? error.message : "unknown"
      )
    }
  }
  return parsed.room
}

export async function writeRoom(
  code: string,
  accounts: ZeusAccount[],
  baseUpdatedAt?: string
): Promise<RoomWriteResult> {
  const normalized = normalizeRoomCode(code)
  if (!normalized) return { ok: false, reason: "missing" }
  const redis = redisFromEnv()
  if (redis) return writeRoomRedis(redis, normalized, accounts, baseUpdatedAt)
  if (isServerlessRuntime()) return { ok: false, reason: "missing" }
  return writeRoomFile(normalized, accounts, baseUpdatedAt)
}

export const VAULT_REDIS_KEY = "olympus:vault:main"
const VAULT_CODE = "main"
const VAULT_LOCK = "olympus:vault:main"
const VAULT_DIR = path.join(process.cwd(), ".data", "vault")
const VAULT_FILE = path.join(VAULT_DIR, "main.json")

function emptyVault(): RoomData {
  return {
    code: VAULT_CODE,
    createdAt: "",
    updatedAt: "",
    accounts: [],
  }
}

async function readVaultFile(): Promise<ParsedRoom | null> {
  let raw: string
  try {
    raw = await fs.readFile(VAULT_FILE, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
  const parsed = parseRoom(JSON.parse(raw) as unknown, VAULT_CODE)
  if (!parsed) throw new Error("VAULT_INVALID")
  return parsed
}

async function replaceVaultFile(room: StoredRoom): Promise<void> {
  await fs.mkdir(VAULT_DIR, { recursive: true })
  const temp = path.join(VAULT_DIR, `.main.${process.pid}.tmp`)
  const backup = path.join(VAULT_DIR, `.main.${process.pid}.bak`)
  await fs.writeFile(temp, JSON.stringify(room, null, 2), "utf8")
  let movedAside = false
  try {
    await fs.rename(VAULT_FILE, backup)
    movedAside = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  try {
    await fs.rename(temp, VAULT_FILE)
  } catch (error) {
    if (movedAside) await fs.rename(backup, VAULT_FILE).catch(() => undefined)
    throw error
  }
  if (movedAside) await fs.rm(backup, { force: true }).catch(() => undefined)
}

async function migrateVaultFile(seenUpdatedAt: string): Promise<void> {
  if (!isEncryptionKeyConfigured()) return
  await enqueueRoomWrite(VAULT_LOCK, async () => {
    let raw: string
    try {
      raw = await fs.readFile(VAULT_FILE, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    const stored = JSON.parse(raw) as { code?: unknown; updatedAt?: unknown }
    if (stored.code !== VAULT_CODE || stored.updatedAt !== seenUpdatedAt) return
    if (!hasPlaintextPassword(stored)) return
    await replaceVaultFile(sealRawPasswords(stored))
  })
}

async function readVaultRedis(redis: Redis): Promise<ParsedRoom | null> {
  const value = await redis.get<unknown>(VAULT_REDIS_KEY)
  if (value == null) return null
  const parsed = parseRoom(value, VAULT_CODE)
  if (!parsed) throw new Error("VAULT_INVALID")
  return parsed
}

async function migrateVaultRedis(
  redis: Redis,
  seenUpdatedAt: string
): Promise<void> {
  if (!isEncryptionKeyConfigured()) return
  await enqueueRoomWrite(VAULT_LOCK, async () => {
    const token = await acquireVaultLock(redis as VaultLockClient)
    if (!token) return
    try {
      const stored = await redis.get<unknown>(VAULT_REDIS_KEY)
      if (!stored || typeof stored !== "object") return
      const record = stored as { code?: unknown; updatedAt?: unknown }
      if (record.code !== VAULT_CODE || record.updatedAt !== seenUpdatedAt) return
      if (!hasPlaintextPassword(stored)) return
      await redis.set(VAULT_REDIS_KEY, sealRawPasswords(stored))
    } finally {
      await releaseVaultLock(redis as VaultLockClient, token)
    }
  })
}

function vaultFromAccounts(
  existing: RoomData | null,
  accounts: ZeusAccount[]
): RoomData {
  const now = new Date().toISOString()
  return {
    code: VAULT_CODE,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    accounts: preserveUsageList(filterAccounts(accounts), existing?.accounts ?? []),
  }
}

async function writeVaultFile(
  accounts: ZeusAccount[],
  baseUpdatedAt?: string
): Promise<RoomWriteResult> {
  return enqueueRoomWrite(VAULT_LOCK, async () => {
    const existing = await readVaultFile()
    if (!existing) {
      const room = vaultFromAccounts(null, accounts)
      await fs.mkdir(VAULT_DIR, { recursive: true })
      try {
        await fs.writeFile(VAULT_FILE, JSON.stringify(toStoredRoom(room), null, 2), {
          encoding: "utf8",
          flag: "wx",
        })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
        const current = await readVaultFile()
        if (!current) return { ok: false, reason: "missing" }
        return { ok: false, reason: "conflict", room: current.room }
      }
      return { ok: true, room }
    }
    if (
      (baseUpdatedAt && existing.room.updatedAt !== baseUpdatedAt) ||
      (!baseUpdatedAt && existing.room.updatedAt)
    ) {
      return { ok: false, reason: "conflict", room: existing.room }
    }
    const room = vaultFromAccounts(existing.room, accounts)
    await replaceVaultFile(toStoredRoom(room))
    return { ok: true, room }
  })
}

async function writeVaultRedis(
  redis: Redis,
  accounts: ZeusAccount[],
  baseUpdatedAt?: string
): Promise<RoomWriteResult> {
  return enqueueRoomWrite(VAULT_LOCK, async () => {
    const token = await acquireVaultLock(redis as VaultLockClient)
    if (!token) {
      const current = await readVaultRedis(redis)
      if (!current) return { ok: false, reason: "missing" }
      return { ok: false, reason: "conflict", room: current.room }
    }
    try {
      const existing = await readVaultRedis(redis)
      if (!existing) {
        const room = vaultFromAccounts(null, accounts)
        const saved = await redis.set(VAULT_REDIS_KEY, toStoredRoom(room), {
          nx: true,
        })
        if (saved === "OK") return { ok: true, room }
        const current = await readVaultRedis(redis)
        if (!current) return { ok: false, reason: "missing" }
        return { ok: false, reason: "conflict", room: current.room }
      }
      if (
        (baseUpdatedAt && existing.room.updatedAt !== baseUpdatedAt) ||
        (!baseUpdatedAt && existing.room.updatedAt)
      ) {
        return { ok: false, reason: "conflict", room: existing.room }
      }
      const room = vaultFromAccounts(existing.room, accounts)
      await redis.set(VAULT_REDIS_KEY, toStoredRoom(room))
      return { ok: true, room }
    } finally {
      await releaseVaultLock(redis as VaultLockClient, token)
    }
  })
}

export type UsageWriteResult =
  | { ok: true; account: ZeusAccount; updatedAt: string }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "in_use"; account: ZeusAccount }
  | { ok: false; reason: "not_holder"; account: ZeusAccount }
  | { ok: false; reason: "busy" }

function applyUsageToRoom(
  room: RoomData,
  accountId: string,
  action: UsageAction,
  memberId: MemberId
): { result: UsageWriteResult; room?: RoomData } {
  const current = room.accounts.find((account) => account.id === accountId)
  if (!current) return { result: { ok: false, reason: "missing" } }
  const decision = decideUsage(current, action, memberId, new Date().toISOString())
  if (decision.type === "in_use") {
    return { result: { ok: false, reason: "in_use", account: current } }
  }
  if (decision.type === "not_holder") {
    return { result: { ok: false, reason: "not_holder", account: current } }
  }
  if (!decision.changed) {
    return { result: { ok: true, account: current, updatedAt: room.updatedAt } }
  }
  const next: RoomData = {
    ...room,
    updatedAt: new Date().toISOString(),
    accounts: room.accounts.map((account) =>
      account.id === accountId ? decision.account : account
    ),
  }
  return {
    result: { ok: true, account: decision.account, updatedAt: next.updatedAt },
    room: next,
  }
}

export async function updateVaultUsage(
  accountId: string,
  action: UsageAction,
  memberId: MemberId
): Promise<UsageWriteResult> {
  const redis = redisFromEnv()
  if (!redis && isServerlessRuntime()) {
    throw new Error(
      "CLOUD_STORE_MISSING: Vercel에서 Upstash Redis(KV)를 연결해야 공유 계정을 쓸 수 있습니다."
    )
  }
  return enqueueRoomWrite(VAULT_LOCK, async () => {
    if (redis) {
      const token = await acquireVaultLock(redis as VaultLockClient)
      if (!token) return { ok: false, reason: "busy" }
      try {
        const existing = await readVaultRedis(redis)
        if (!existing) return { ok: false, reason: "missing" }
        const applied = applyUsageToRoom(existing.room, accountId, action, memberId)
        if (applied.room) await redis.set(VAULT_REDIS_KEY, toStoredRoom(applied.room))
        return applied.result
      } finally {
        await releaseVaultLock(redis as VaultLockClient, token)
      }
    }
    const existing = await readVaultFile()
    if (!existing) return { ok: false, reason: "missing" }
    const applied = applyUsageToRoom(existing.room, accountId, action, memberId)
    if (applied.room) await replaceVaultFile(toStoredRoom(applied.room))
    return applied.result
  })
}

export async function readVault(): Promise<RoomData> {
  const redis = redisFromEnv()
  if (!redis && isServerlessRuntime()) {
    throw new Error(
      "CLOUD_STORE_MISSING: Vercel에서 Upstash Redis(KV)를 연결해야 공유 계정을 쓸 수 있습니다."
    )
  }
  const parsed = redis ? await readVaultRedis(redis) : await readVaultFile()
  if (!parsed) return emptyVault()
  if (parsed.needsMigration && isEncryptionKeyConfigured()) {
    try {
      if (redis) await migrateVaultRedis(redis, parsed.room.updatedAt)
      else await migrateVaultFile(parsed.room.updatedAt)
    } catch (error) {
      console.error(
        "[vault] password migration skipped",
        error instanceof Error ? error.message : "unknown"
      )
    }
  }
  return parsed.room
}

export async function writeVault(
  accounts: ZeusAccount[],
  baseUpdatedAt?: string
): Promise<RoomWriteResult> {
  const redis = redisFromEnv()
  if (!redis && isServerlessRuntime()) {
    throw new Error(
      "CLOUD_STORE_MISSING: Vercel에서 Upstash Redis(KV)를 연결해야 공유 계정을 쓸 수 있습니다."
    )
  }
  if (redis) return writeVaultRedis(redis, accounts, baseUpdatedAt)
  return writeVaultFile(accounts, baseUpdatedAt)
}
