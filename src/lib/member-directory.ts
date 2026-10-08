import { promises as fs } from "fs"
import path from "path"
import { Redis } from "@upstash/redis"
import {
  DEFAULT_MEMBER_NAMES,
  VAULT_MEMBERS,
  isMemberId,
  normalizeMemberName,
  type MemberId,
  type MemberNames,
} from "@/lib/members"
import { acquireLock, releaseLock, type VaultLockClient } from "@/lib/vault-lock"

export const MEMBER_DIRECTORY_KEY = "olympus:vault:members"
export const MEMBER_DIRECTORY_LOCK_KEY = "olympus:vault:members:lock"

const VAULT_DIR = path.join(process.cwd(), ".data", "vault")
const MEMBERS_FILE = path.join(VAULT_DIR, "members.json")

export type MemberDirectory = {
  names: MemberNames
  updatedAt: string
}

type StoredDirectory = MemberNames & { updatedAt: string }

function toStored(directory: MemberDirectory): StoredDirectory {
  return {
    member1: directory.names.member1,
    member2: directory.names.member2,
    member3: directory.names.member3,
    updatedAt: directory.updatedAt,
  }
}

export type RenameMemberResult =
  | { ok: true; directory: MemberDirectory }
  | { ok: false; reason: "invalid-id" | "invalid-name" | "busy" }

const writeTails = new Map<string, Promise<void>>()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const previous = writeTails.get(MEMBER_DIRECTORY_KEY) ?? Promise.resolve()
  const run = previous.then(task, task)
  writeTails.set(
    MEMBER_DIRECTORY_KEY,
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

function emptyDirectory(): MemberDirectory {
  return { names: { ...DEFAULT_MEMBER_NAMES }, updatedAt: "" }
}

function parseDirectory(value: unknown): MemberDirectory | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const names = { ...DEFAULT_MEMBER_NAMES }
  for (const member of VAULT_MEMBERS) {
    const name = normalizeMemberName(row[member.id])
    if (name) names[member.id] = name
  }
  return {
    names,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  }
}

async function readMembersFile(): Promise<MemberDirectory | null> {
  try {
    const raw = await fs.readFile(MEMBERS_FILE, "utf8")
    return parseDirectory(JSON.parse(raw) as unknown)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

async function replaceMembersFile(directory: MemberDirectory): Promise<void> {
  await fs.mkdir(VAULT_DIR, { recursive: true })
  const temp = path.join(VAULT_DIR, `.members.${process.pid}.tmp`)
  const backup = path.join(VAULT_DIR, `.members.${process.pid}.bak`)
  await fs.writeFile(temp, JSON.stringify(toStored(directory), null, 2), "utf8")
  let movedAside = false
  try {
    await fs.rename(MEMBERS_FILE, backup)
    movedAside = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  try {
    await fs.rename(temp, MEMBERS_FILE)
  } catch (error) {
    if (movedAside) await fs.rename(backup, MEMBERS_FILE).catch(() => undefined)
    throw error
  }
  if (movedAside) await fs.rm(backup, { force: true }).catch(() => undefined)
}

function cloudMissing(): Error {
  return new Error(
    "CLOUD_STORE_MISSING: Vercel에서 Upstash Redis(KV)를 연결해야 공유 계정을 쓸 수 있습니다."
  )
}

export async function readMemberDirectory(): Promise<MemberDirectory> {
  const redis = redisFromEnv()
  if (!redis && isServerlessRuntime()) throw cloudMissing()
  if (redis) {
    const value = await redis.get<unknown>(MEMBER_DIRECTORY_KEY)
    return parseDirectory(value) ?? emptyDirectory()
  }
  return (await readMembersFile()) ?? emptyDirectory()
}

export async function renameMember(
  id: string,
  rawName: unknown
): Promise<RenameMemberResult> {
  if (!isMemberId(id)) return { ok: false, reason: "invalid-id" }
  const name = normalizeMemberName(rawName)
  if (!name) return { ok: false, reason: "invalid-name" }
  const redis = redisFromEnv()
  if (!redis && isServerlessRuntime()) throw cloudMissing()
  return enqueue(() => (redis ? renameRedis(redis, id, name) : renameFile(id, name)))
}

async function renameFile(id: MemberId, name: string): Promise<RenameMemberResult> {
  const current = (await readMembersFile()) ?? emptyDirectory()
  const directory: MemberDirectory = {
    names: { ...current.names, [id]: name },
    updatedAt: new Date().toISOString(),
  }
  await replaceMembersFile(directory)
  return { ok: true, directory }
}

async function renameRedis(
  redis: Redis,
  id: MemberId,
  name: string
): Promise<RenameMemberResult> {
  const client = redis as VaultLockClient
  const token = await acquireLock(client, MEMBER_DIRECTORY_LOCK_KEY)
  if (!token) return { ok: false, reason: "busy" }
  try {
    const current = parseDirectory(await redis.get<unknown>(MEMBER_DIRECTORY_KEY)) ?? emptyDirectory()
    const directory: MemberDirectory = {
      names: { ...current.names, [id]: name },
      updatedAt: new Date().toISOString(),
    }
    await redis.set(MEMBER_DIRECTORY_KEY, toStored(directory))
    return { ok: true, directory }
  } finally {
    await releaseLock(client, MEMBER_DIRECTORY_LOCK_KEY, token)
  }
}
