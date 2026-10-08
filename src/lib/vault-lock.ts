import { randomBytes } from "crypto"

export const VAULT_LOCK_KEY = "olympus:vault:main:lock"
const LOCK_TTL_SECONDS = 5
const LOCK_ATTEMPTS = 6

export const RELEASE_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

export type VaultLockClient = {
  set(
    key: string,
    value: string,
    opts: { nx: true; ex: number }
  ): Promise<string | null>
  eval(script: string, keys: string[], args: string[]): Promise<unknown>
}

export function ownsLock(current: string | null, token: string): boolean {
  return current === token
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function acquireLock(
  redis: VaultLockClient,
  key: string
): Promise<string | null> {
  const token = randomBytes(16).toString("hex")
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    const locked = await redis.set(key, token, {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    })
    if (locked === "OK") return token
    await wait(40 * (attempt + 1))
  }
  return null
}

export async function releaseLock(
  redis: VaultLockClient,
  key: string,
  token: string
): Promise<void> {
  try {
    await redis.eval(RELEASE_LOCK_SCRIPT, [key], [token])
  } catch {
    // The lock expires on its own. Never delete it without comparing the token.
  }
}

export function acquireVaultLock(redis: VaultLockClient): Promise<string | null> {
  return acquireLock(redis, VAULT_LOCK_KEY)
}

export function releaseVaultLock(
  redis: VaultLockClient,
  token: string
): Promise<void> {
  return releaseLock(redis, VAULT_LOCK_KEY, token)
}
