"use client"

import { Zap } from "lucide-react"
import { GameSettings } from "@/components/game-settings"
import { MemberSettings } from "@/components/member-settings"
import type { VaultGame } from "@/lib/games"
import type { MemberNames } from "@/lib/members"
import type { ZeusAccount } from "@/lib/types"

export type VaultScreen = "dashboard" | "accounts"

const itemClass =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--zeus-mist)] hover:bg-white/5 hover:text-[var(--zeus-ivory)]"
const itemActiveClass =
  "flex w-full items-center gap-2 rounded-lg bg-[rgba(212,162,76,0.16)] px-3 py-2 text-left text-sm font-medium text-[var(--zeus-gold)] shadow-[inset_3px_0_0_0_var(--zeus-gold)]"

export function VaultSidebar({
  open,
  screen,
  gameFilter,
  currentUserName,
  names,
  games,
  accounts,
  onGamesUpdated,
  onClose,
  onDashboard,
  onAllAccounts,
  onGame,
  onImport,
  onExport,
  onChangeMember,
  onLock,
  onNamesUpdated,
}: {
  open: boolean
  screen: VaultScreen
  gameFilter: string
  currentUserName: string
  names: MemberNames
  games: VaultGame[]
  accounts: ZeusAccount[]
  onGamesUpdated: (games: VaultGame[], updatedAt: string) => void
  onClose: () => void
  onDashboard: () => void
  onAllAccounts: () => void
  onGame: (gameId: string) => void
  onImport: () => void
  onExport: () => void
  onChangeMember: () => void
  onLock: () => void
  onNamesUpdated: (names: MemberNames, updatedAt: string) => void
}) {
  function choose(action: () => void) {
    action()
    onClose()
  }

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="fixed inset-0 z-30 bg-black/55 lg:hidden"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={`fixed top-0 left-0 z-40 flex h-dvh w-64 flex-col overflow-hidden border-r border-[rgba(212,162,76,0.16)] bg-[#050910] ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="shrink-0 border-b border-white/8 px-4 py-5">
          <div className="flex items-center gap-2 text-[var(--zeus-gold)]">
            <Zap className="size-4 shrink-0" aria-hidden />
            <p className="font-[family-name:var(--font-display)] text-lg leading-none tracking-[0.06em] text-[var(--zeus-ivory)]">
              OLYMPUS VAULT
            </p>
          </div>
          <p className="mt-2 text-[0.62rem] tracking-[0.14em] text-[var(--zeus-mist)]">
            GAME ACCOUNT CONTROL CENTER
          </p>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="주요 메뉴">
          <button
            type="button"
            className={screen === "dashboard" ? itemActiveClass : itemClass}
            aria-current={screen === "dashboard" ? "page" : undefined}
            onClick={() => choose(onDashboard)}
          >
            대시보드
          </button>
          <button
            type="button"
            className={screen === "accounts" && gameFilter === "all" ? itemActiveClass : itemClass}
            aria-current={screen === "accounts" && gameFilter === "all" ? "page" : undefined}
            onClick={() => choose(onAllAccounts)}
          >
            전체 계정
          </button>

          <div className="flex items-center justify-between px-3 pt-4 pb-1">
            <p className="text-[0.775rem] font-semibold tracking-[0.16em] text-[#c4d2e4]">게임</p>
            <GameSettings
              games={games}
              accounts={accounts}
              onUpdated={onGamesUpdated}
              onOpen={onClose}
            />
          </div>
          {games.map((game) => {
            const active = screen === "accounts" && gameFilter === game.id
            return (
              <button
                key={game.id}
                type="button"
                className={active ? itemActiveClass : itemClass}
                aria-current={active ? "page" : undefined}
                onClick={() => choose(() => onGame(game.id))}
              >
                {game.name}
              </button>
            )
          })}

          <p className="px-3 pt-4 pb-1 text-[0.775rem] font-semibold tracking-[0.16em] text-[#c4d2e4]">관리</p>
          <button type="button" className={itemClass} onClick={() => choose(onImport)}>
            가져오기
          </button>
          <button type="button" className={itemClass} onClick={() => choose(onExport)}>
            내보내기
          </button>
          <MemberSettings
            names={names}
            onUpdated={onNamesUpdated}
            triggerClassName={itemClass}
            onOpen={onClose}
          />
          <button type="button" className={itemClass} onClick={() => choose(onChangeMember)}>
            사용자 변경
          </button>
          <button type="button" className={itemClass} onClick={() => choose(onLock)}>
            잠금
          </button>
        </nav>

        <div className="shrink-0 px-3 pt-3 pb-6">
          <div className="rounded-xl border border-[rgba(212,162,76,0.22)] bg-black/25 px-3 py-3">
            <p className="text-[0.65rem] tracking-[0.14em] text-[var(--zeus-gold)]">현재 사용자</p>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--zeus-ivory)]">{currentUserName}</p>
          </div>
        </div>
      </aside>
    </>
  )
}
