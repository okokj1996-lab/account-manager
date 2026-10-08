"use client"

import { useEffect, useState } from "react"
import { ChevronRight } from "lucide-react"
import { gameName, type VaultGame } from "@/lib/games"
import { isMemberId, memberName, type MemberNames } from "@/lib/members"
import type { ZeusAccount } from "@/lib/types"

function isInUse(account: ZeusAccount): boolean {
  return account.usageStatus === "in_use"
}

function isResting(account: ZeusAccount): boolean {
  return account.status === "resting"
}

function formatClock(value?: string): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

function formatElapsed(startedAt: string | undefined, now: number): string {
  if (!startedAt) return ""
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return ""
  const minutes = Math.max(0, Math.floor((now - start) / 60000))
  if (minutes < 1) return "1분 미만"
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`
}

export function VaultDashboard({
  accounts,
  names,
  games,
  onOpenGame,
  onOpenAccount,
}: {
  accounts: ZeusAccount[]
  names: MemberNames
  games: VaultGame[]
  onOpenGame: (gameId: string) => void
  onOpenAccount: (account: ZeusAccount) => void
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const inUse = accounts.filter(isInUse)
  const resting = accounts.filter(isResting).length
  const available = accounts.filter((account) => !isResting(account) && !isInUse(account)).length

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-wide text-[var(--zeus-ivory)]">
            대시보드
          </h1>
          <p className="mt-2 text-sm text-[var(--zeus-mist)]">
            OLYMPUS VAULT의 현재 계정 운영 현황입니다.
          </p>
        </div>
        <p className="inline-flex items-center gap-2 text-xs text-[var(--zeus-mist)]">
          <span aria-hidden className="size-1.5 rounded-full bg-[var(--zeus-gold)]" />
          실시간 업데이트
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="계정 요약">
        <SummaryCard label="전체 계정" value={accounts.length} hint="등록된 모든 계정" />
        <SummaryCard label="사용 가능" value={available} hint="바로 사용할 수 있는 계정" />
        <SummaryCard label="사용 중" value={inUse.length} hint="현재 사용 중인 계정" emphasis />
        <SummaryCard label="휴면" value={resting} hint="사용하지 않는 계정" />
      </section>

      <section className="rounded-2xl bg-[#0c1a2e]/80 p-4 ring-1 ring-white/8 sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm tracking-[0.14em] text-[var(--zeus-gold)]">현재 사용 중</h2>
          <span className="rounded-full border border-[rgba(212,162,76,0.35)] px-2 py-0.5 text-xs text-[var(--zeus-gold)]">
            {inUse.length}개
          </span>
        </div>
        {inUse.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--zeus-mist)]">현재 사용 중인 계정이 없습니다.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {inUse.map((account) => {
              const holder = isMemberId(account.currentUserId)
                ? memberName(account.currentUserId, names)
                : ""
              const clock = formatClock(account.usageStartedAt)
              const elapsed = formatElapsed(account.usageStartedAt, now)
              const details = [
                account.characterName.trim() ? `캐릭터: ${account.characterName.trim()}` : "",
                account.server.trim() ? `서버: ${account.server.trim()}` : "",
              ].filter(Boolean)
              const timing = [clock ? `${clock}부터` : "", elapsed ? `${elapsed} 사용 중` : ""]
                .filter(Boolean)
                .join(" · ")
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => onOpenAccount(account)}
                    className="group flex w-full flex-col gap-1 rounded-xl bg-black/20 px-3 py-3 text-left ring-1 ring-white/8 hover:bg-[#12243a] hover:ring-[rgba(212,162,76,0.4)]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        {holder ? (
                          <span className="text-sm font-semibold text-[var(--zeus-ivory)]">{holder}</span>
                        ) : null}
                        <span className="rounded-md border border-[rgba(212,162,76,0.4)] px-1.5 py-0.5 font-mono text-[0.65rem] tracking-wide text-[var(--zeus-gold)]">
                          {gameName(account.game, games)}
                        </span>
                        <span className="font-mono text-sm text-[var(--zeus-ivory)]">{account.username}</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <span className="rounded-full bg-[rgba(212,162,76,0.14)] px-2 py-0.5 text-[0.65rem] text-[var(--zeus-gold)]">
                          사용 중
                        </span>
                        <ChevronRight
                          className="size-4 text-[var(--zeus-mist)] group-hover:text-[var(--zeus-gold)]"
                          aria-hidden
                        />
                      </span>
                    </span>
                    {details.length > 0 ? (
                      <span className="block text-xs text-[var(--zeus-mist)]">{details.join(" · ")}</span>
                    ) : null}
                    {timing ? (
                      <span className="block text-xs text-[var(--zeus-mist)]">{timing}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm tracking-[0.14em] text-[var(--zeus-mist)]">게임별 현황</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {games.map((game) => {
            const rows = accounts.filter((account) => account.game === game.id)
            const busy = rows.filter(isInUse).length
            const ready = rows.filter((account) => !isResting(account) && !isInUse(account)).length
            const dormant = rows.filter(isResting).length
            return (
              <li key={game.id}>
                <button
                  type="button"
                  onClick={() => onOpenGame(game.id)}
                  className="flex h-full w-full flex-col rounded-2xl bg-[#0c1a2e]/80 px-4 py-4 text-left ring-1 ring-white/8 hover:bg-[#12243a] hover:ring-[rgba(212,162,76,0.35)]"
                >
                  <span className="text-sm font-medium text-[var(--zeus-ivory)]">{game.name}</span>
                  <span className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <Metric label="전체 계정" value={rows.length} />
                    <Metric label="사용 중" value={busy} />
                    <Metric label="사용 가능" value={ready} />
                    <Metric label="휴면" value={dormant} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string
  value: number
  hint: string
  emphasis?: boolean
}) {
  return (
    <div
      className={`rounded-2xl px-4 py-4 ${
        emphasis
          ? "bg-[#0c1a2e] ring-1 ring-[rgba(212,162,76,0.5)]"
          : "bg-[#0c1a2e]/80 ring-1 ring-white/8"
      }`}
    >
      <p className={`text-[0.65rem] tracking-[0.14em] ${emphasis ? "text-[var(--zeus-gold)]" : "text-[var(--zeus-mist)]"}`}>
        {label}
      </p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--zeus-gold)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--zeus-mist)]">{hint}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--zeus-mist)]">{label}</span>
      <span className="font-medium text-[var(--zeus-ivory)]">{value}</span>
    </span>
  )
}
