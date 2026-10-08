import {
  createHmac,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "crypto"
import { promisify } from "util"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
) => Promise<Buffer>

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 32
const SCRYPT_SALT_BYTES = 16
const SCRYPT_MAXMEM = 32 * 1024 * 1024
const PASSWORD_MAX_LENGTH = 256

const SESSION_SECRET_BYTES = 32
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000
const SESSION_COOKIE = "olympus_vault_session"
const SESSION_TOKEN_MAX_LENGTH = 512

type StoredPasswordHash = {
  salt: Buffer
  hash: Buffer
}

export type VaultPasswordResult = "ok" | "denied" | "unavailable"

function decodeCanonicalBase64(
  value: string,
  expectedLength: number
): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null
  const bytes = Buffer.from(value, "base64")
  if (bytes.length !== expectedLength) return null
  const canonical = bytes.toString("base64")
  const left = Buffer.from(value)
  const right = Buffer.from(canonical)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  return bytes
}

function readPasswordHash(): StoredPasswordHash | null {
  const raw = process.env.VAULT_ACCESS_PASSWORD_HASH
  if (typeof raw !== "string") return null
  const parts = raw.trim().split(":")
  if (parts.length !== 6) return null
  if (parts[0] !== "scrypt") return null
  if (parts[1] !== String(SCRYPT_N)) return null
  if (parts[2] !== String(SCRYPT_R)) return null
  if (parts[3] !== String(SCRYPT_P)) return null
  const salt = decodeCanonicalBase64(parts[4], SCRYPT_SALT_BYTES)
  const hash = decodeCanonicalBase64(parts[5], SCRYPT_KEYLEN)
  if (!salt || !hash) return null
  return { salt, hash }
}

function conflictsWithEncryptionKey(sessionSecret: string): boolean {
  const other = process.env.ACCOUNT_ENCRYPTION_KEY
  if (typeof other !== "string") return false
  const trimmed = other.trim()
  if (trimmed.length !== sessionSecret.length) return false
  return timingSafeEqual(Buffer.from(sessionSecret), Buffer.from(trimmed))
}

function readSessionSecret(): Buffer | null {
  const raw = process.env.VAULT_SESSION_SECRET
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) return null
  const secret = decodeCanonicalBase64(trimmed, SESSION_SECRET_BYTES)
  if (!secret) return null
  if (conflictsWithEncryptionKey(trimmed)) return null
  return secret
}

export function isVaultAuthConfigured(): boolean {
  return readPasswordHash() !== null && readSessionSecret() !== null
}

export async function verifyVaultAccessPassword(
  password: string
): Promise<VaultPasswordResult> {
  const stored = readPasswordHash()
  if (!stored || !readSessionSecret()) return "unavailable"
  if (password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
    return "denied"
  }
  try {
    const derived = await scryptAsync(password, stored.salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    })
    if (derived.length !== stored.hash.length) return "denied"
    return timingSafeEqual(derived, stored.hash) ? "ok" : "denied"
  } catch {
    return "unavailable"
  }
}

export function createVaultSessionToken(): string | null {
  const secret = readSessionSecret()
  if (!secret) return null
  const payload = Buffer.from(
    JSON.stringify({ v: 1, exp: Date.now() + SESSION_MAX_AGE_MS }),
    "utf8"
  ).toString("base64url")
  const signature = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

async function readSessionCookie(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || token.length > SESSION_TOKEN_MAX_LENGTH) return null
  return token
}

export async function hasValidVaultSession(): Promise<boolean> {
  const token = await readSessionCookie()
  if (!token) return false
  const secret = readSessionSecret()
  if (!secret) return false
  const dot = token.indexOf(".")
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return false
  const payload = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  let provided: Buffer
  try {
    provided = Buffer.from(signature, "base64url")
  } catch {
    return false
  }
  const expected = createHmac("sha256", secret).update(payload).digest()
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return false
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return false
  }
  if (!parsed || typeof parsed !== "object") return false
  const row = parsed as Record<string, unknown>
  if (row.v !== 1 || typeof row.exp !== "number" || !Number.isFinite(row.exp)) {
    return false
  }
  const now = Date.now()
  if (row.exp <= now) return false
  if (row.exp > now + SESSION_MAX_AGE_MS + 5 * 60 * 1000) return false
  return true
}

export async function requireVaultSession(): Promise<NextResponse | null> {
  if (await hasValidVaultSession()) return null
  return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 })
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  }
}

export function applyVaultSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS))
}

export function clearVaultSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0))
}
