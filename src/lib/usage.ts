import { isMemberId, type MemberId } from "@/lib/members"
import type { ZeusAccount } from "@/lib/types"

export type UsageAction = "start" | "stop"

export type UsageDecision =
  | { type: "ok"; account: ZeusAccount; changed: boolean }
  | { type: "in_use"; account: ZeusAccount }
  | { type: "not_holder"; account: ZeusAccount }

function holder(account: ZeusAccount): MemberId | null {
  if (account.usageStatus === "in_use" && isMemberId(account.currentUserId)) {
    return account.currentUserId
  }
  return null
}

function withoutUsage(account: ZeusAccount): ZeusAccount {
  const next = { ...account }
  delete next.usageStatus
  delete next.currentUserId
  delete next.usageStartedAt
  delete next.lastUsedBy
  delete next.lastUsedAt
  return next
}

export function preserveAccountUsage(
  incoming: ZeusAccount,
  stored?: ZeusAccount
): ZeusAccount {
  const next = withoutUsage(incoming)
  if (!stored) return next
  if (stored.usageStatus === "available" || stored.usageStatus === "in_use") {
    next.usageStatus = stored.usageStatus
  }
  if (isMemberId(stored.currentUserId)) next.currentUserId = stored.currentUserId
  if (stored.usageStartedAt) next.usageStartedAt = stored.usageStartedAt
  if (isMemberId(stored.lastUsedBy)) next.lastUsedBy = stored.lastUsedBy
  if (stored.lastUsedAt) next.lastUsedAt = stored.lastUsedAt
  return next
}

export function preserveUsageList(
  incoming: ZeusAccount[],
  stored: ZeusAccount[]
): ZeusAccount[] {
  const byId = new Map(stored.map((account) => [account.id, account]))
  return incoming.map((account) => preserveAccountUsage(account, byId.get(account.id)))
}

export function sameUsageState(left?: ZeusAccount, right?: ZeusAccount): boolean {
  if (!left || !right) return left === right
  return (
    left.usageStatus === right.usageStatus &&
    left.currentUserId === right.currentUserId &&
    left.usageStartedAt === right.usageStartedAt &&
    left.lastUsedBy === right.lastUsedBy &&
    left.lastUsedAt === right.lastUsedAt
  )
}

export function isAccountInUse(account: ZeusAccount): boolean {
  return holder(account) !== null
}

export function decideUsage(
  account: ZeusAccount,
  action: UsageAction,
  memberId: MemberId,
  now: string
): UsageDecision {
  const heldBy = holder(account)
  if (action === "start") {
    if (heldBy === memberId) return { type: "ok", account, changed: false }
    if (heldBy) return { type: "in_use", account }
    return {
      type: "ok",
      changed: true,
      account: {
        ...account,
        usageStatus: "in_use",
        currentUserId: memberId,
        usageStartedAt: now,
      },
    }
  }
  if (heldBy !== memberId) return { type: "not_holder", account }
  const next: ZeusAccount = {
    ...account,
    usageStatus: "available",
    lastUsedBy: memberId,
    lastUsedAt: now,
  }
  delete next.currentUserId
  delete next.usageStartedAt
  return { type: "ok", account: next, changed: true }
}
