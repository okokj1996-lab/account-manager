import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "crypto"

const ALGORITHM = "aes-256-gcm"
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

export type EncryptedPassword = {
  v: 1
  alg: "A256GCM"
  iv: string
  tag: string
  ct: string
}

export function isEncryptedPassword(value: unknown): value is EncryptedPassword {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return (
    row.v === 1 &&
    row.alg === "A256GCM" &&
    typeof row.iv === "string" &&
    typeof row.tag === "string" &&
    typeof row.ct === "string"
  )
}

export function isEncryptionKeyConfigured(): boolean {
  try {
    parseEncryptionKey()
    return true
  } catch {
    return false
  }
}

export function parseEncryptionKey(): Buffer {
  const raw = process.env.ACCOUNT_ENCRYPTION_KEY
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("ENCRYPTION_KEY_MISSING")
  }
  const trimmed = raw.trim()
  if (!/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) {
    throw new Error("ENCRYPTION_KEY_INVALID")
  }
  const key = Buffer.from(trimmed, "base64")
  if (key.length !== KEY_BYTES) {
    throw new Error("ENCRYPTION_KEY_INVALID")
  }
  const canonical = key.toString("base64")
  const left = Buffer.from(trimmed)
  const right = Buffer.from(canonical)
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("ENCRYPTION_KEY_INVALID")
  }
  return key
}

export function encryptPassword(plain: string): EncryptedPassword {
  if (typeof plain !== "string") throw new Error("ENCRYPTION_FAILED")
  const key = parseEncryptionKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return {
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ciphertext.toString("base64"),
  }
}

export function decryptPassword(payload: EncryptedPassword): string {
  const key = parseEncryptionKey()
  let iv: Buffer
  let tag: Buffer
  let ciphertext: Buffer
  try {
    iv = Buffer.from(payload.iv, "base64")
    tag = Buffer.from(payload.tag, "base64")
    ciphertext = Buffer.from(payload.ct, "base64")
  } catch {
    throw new Error("ENCRYPTION_DECRYPT_FAILED")
  }
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("ENCRYPTION_DECRYPT_FAILED")
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    throw new Error("ENCRYPTION_DECRYPT_FAILED")
  }
}

export function encryptionErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  if (
    error.message === "ENCRYPTION_KEY_MISSING" ||
    error.message === "ENCRYPTION_KEY_INVALID"
  ) {
    return 503
  }
  if (
    error.message === "ENCRYPTION_DECRYPT_FAILED" ||
    error.message === "ENCRYPTION_FAILED"
  ) {
    return 500
  }
  return null
}

export function encryptionErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  if (error.message === "ENCRYPTION_KEY_MISSING") {
    return "서버 암호화 키(ACCOUNT_ENCRYPTION_KEY)가 없습니다. 공유 계정을 읽거나 저장할 수 없으며, 저장된 데이터는 변경하지 않았습니다."
  }
  if (error.message === "ENCRYPTION_KEY_INVALID") {
    return "서버 암호화 키(ACCOUNT_ENCRYPTION_KEY)가 올바르지 않습니다. 32바이트 키를 Base64로 넣어야 하며, 저장된 데이터는 변경하지 않았습니다."
  }
  if (error.message === "ENCRYPTION_DECRYPT_FAILED") {
    return "공유 계정 비밀번호를 복호화하지 못했습니다. 저장된 데이터는 변경하지 않았습니다."
  }
  if (error.message === "ENCRYPTION_FAILED") {
    return "공유 계정 비밀번호를 암호화하지 못했습니다. 저장된 데이터는 변경하지 않았습니다."
  }
  return null
}
