"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  Copy,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Zap,
} from "lucide-react"
import { AccountFormDialog } from "@/components/account-form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { gameBadge, gameLabel, GAMES } from "@/lib/games"
import { mergeRoomEdits, sameAccountList } from "@/lib/storage"
import {
  ACCOUNT_STATUS_LABELS,
  type AccountStatus,
  type ZeusAccount,
} from "@/lib/types"
import { filterAccounts } from "@/lib/validate"

type StatusFilter = "all" | AccountStatus
type SortKey = "updated" | "level" | "name"

const STATUS_BADGE: Record<
  AccountStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  resting: "secondary",
  banned: "destructive",
  shared: "outline",
}

export function AccountManager() {
  const [accounts, setAccounts] = useState<ZeusAccount[]>([])
  const [ready, setReady] = useState(false)
  const [vaultOnline, setVaultOnline] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [query, setQuery] = useState("")
  const [deferredQuery, setDeferredQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [gameFilter, setGameFilter] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("updated")
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ZeusAccount | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const skipNextRemoteSave = useRef(false)
  const vaultUpdatedAt = useRef<string | null>(null)
  const vaultBaselineRef = useRef<ZeusAccount[]>([])
  const vaultDirtyRef = useRef(false)
  const saveGenRef = useRef(0)
  const accountsRef = useRef(accounts)
  const vaultOnlineRef = useRef(false)
  const vaultErrorRef = useRef<string | null>(null)
  accountsRef.current = accounts
  vaultOnlineRef.current = vaultOnline

  useEffect(() => {
    async function boot() {
      try {
        const res = await fetch("/api/vault")
        if (!res.ok) {
          let message = "공용 Vault를 불러오지 못했습니다."
          try {
            const data = (await res.json()) as { error?: unknown }
            if (typeof data.error === "string") message = data.error
          } catch {
            // ignore a non-JSON error body
          }
          showToast(message)
          setReady(true)
          return
        }
        const vault = (await res.json()) as {
          updatedAt?: string
          accounts?: ZeusAccount[]
        }
        skipNextRemoteSave.current = true
        vaultDirtyRef.current = false
        vaultUpdatedAt.current = vault.updatedAt || null
        vaultBaselineRef.current = vault.accounts ?? []
        setAccounts(vault.accounts ?? [])
        setVaultOnline(true)
      } catch {
        showToast("공용 Vault를 불러오지 못했습니다.")
      }
      setReady(true)
    }
    void boot()
  }, [])

  useEffect(() => {
    if (!ready || !vaultOnline) return
    if (skipNextRemoteSave.current) {
      skipNextRemoteSave.current = false
      vaultDirtyRef.current = false
      return
    }

    const gen = saveGenRef.current + 1
    saveGenRef.current = gen
    const snapshot = accounts
    const baseUpdatedAt = vaultUpdatedAt.current
    vaultDirtyRef.current = true

    async function push(bodyAccounts: ZeusAccount[], base: string | null, attempt: number) {
      if (saveGenRef.current !== gen || !vaultOnlineRef.current) return
      setSyncing(true)
      try {
        const res = await fetch("/api/vault", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accounts: bodyAccounts,
            baseUpdatedAt: base,
          }),
        })
        if (saveGenRef.current !== gen || !vaultOnlineRef.current) return
        if (res.status === 409) {
          const data = (await res.json()) as {
            room?: { updatedAt: string; accounts: ZeusAccount[] }
          }
          const server = data.room
          if (!server || attempt >= 4) {
            if (server) {
              skipNextRemoteSave.current = true
              vaultBaselineRef.current = server.accounts
              vaultUpdatedAt.current = server.updatedAt
              vaultDirtyRef.current = false
              setAccounts(server.accounts)
              showToast("다른 수정과 겹쳐 공용 목록을 서버 기준으로 맞췄습니다.")
            }
            return
          }
          const merged = mergeRoomEdits(
            vaultBaselineRef.current,
            accountsRef.current,
            server.accounts
          )
          vaultBaselineRef.current = server.accounts
          vaultUpdatedAt.current = server.updatedAt
          if (!sameAccountList(merged, accountsRef.current)) {
            vaultDirtyRef.current = true
            setAccounts(merged)
            return
          }
          if (!sameAccountList(merged, server.accounts)) {
            await push(merged, server.updatedAt, attempt + 1)
            return
          }
          vaultDirtyRef.current = false
          return
        }
        if (!res.ok) {
          let message = "공용 Vault 저장에 실패했습니다."
          try {
            const data = (await res.json()) as { error?: unknown }
            if (typeof data.error === "string") message = data.error
          } catch {
            // ignore a non-JSON error body
          }
          showToast(message)
          return
        }
        const vault = (await res.json()) as { updatedAt: string }
        if (saveGenRef.current !== gen || !vaultOnlineRef.current) return
        vaultUpdatedAt.current = vault.updatedAt
        vaultBaselineRef.current = bodyAccounts
        vaultDirtyRef.current = false
      } catch {
        // ignore transient sync errors
      } finally {
        if (saveGenRef.current === gen) setSyncing(false)
      }
    }

    const id = window.setTimeout(() => {
      void push(snapshot, baseUpdatedAt, 0)
    }, 450)
    return () => window.clearTimeout(id)
  }, [accounts, ready, vaultOnline])

  useEffect(() => {
    if (!ready || !vaultOnline) return
    const id = window.setInterval(async () => {
      if (vaultDirtyRef.current) return
      try {
        const res = await fetch("/api/vault")
        if (!res.ok) {
          if (vaultErrorRef.current !== String(res.status)) {
            vaultErrorRef.current = String(res.status)
            let message = ""
            try {
              const data = (await res.json()) as { error?: unknown }
              if (typeof data.error === "string") message = data.error
            } catch {
              // ignore a non-JSON error body
            }
            if (message) showToast(message)
          }
          return
        }
        vaultErrorRef.current = null
        const vault = (await res.json()) as {
          updatedAt: string
          accounts: ZeusAccount[]
        }
        if (!vaultOnlineRef.current || vaultDirtyRef.current) return
        if (!vault.updatedAt || vault.updatedAt <= (vaultUpdatedAt.current ?? "")) {
          return
        }
        skipNextRemoteSave.current = true
        vaultBaselineRef.current = vault.accounts
        vaultUpdatedAt.current = vault.updatedAt
        setAccounts(vault.accounts)
      } catch {
        // ignore poll errors
      }
    }, 3000)
    return () => window.clearInterval(id)
  }, [ready, vaultOnline])

  useEffect(() => {
    const id = window.setTimeout(() => setDeferredQuery(query), 120)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(id)
  }, [toast])

  function showToast(message: string) {
    setToast(message)
  }

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    let list = accounts.filter((account) => {
      if (statusFilter !== "all" && account.status !== statusFilter) return false
      if (gameFilter !== "all" && account.game !== gameFilter) return false
      if (!q) return true
      return (
        account.username.toLowerCase().includes(q) ||
        account.characterName.toLowerCase().includes(q) ||
        account.server.toLowerCase().includes(q) ||
        account.notes.toLowerCase().includes(q) ||
        account.game.toLowerCase().includes(q) ||
        gameLabel(account.game).toLowerCase().includes(q) ||
        gameBadge(account.game).toLowerCase().includes(q)
      )
    })

    list = [...list].sort((a, b) => {
      if (sortKey === "level") return b.level - a.level
      if (sortKey === "name")
        return a.characterName.localeCompare(b.characterName, "ko")
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    return list
  }, [accounts, deferredQuery, gameFilter, statusFilter, sortKey])

  const stats = useMemo(() => {
    const total = accounts.length
    const active = accounts.filter((a) => a.status === "active").length
    const resting = accounts.filter((a) => a.status === "resting").length
    return { total, active, resting }
  }, [accounts])

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(account: ZeusAccount) {
    setEditing(account)
    setDialogOpen(true)
  }

  function handleSave(account: ZeusAccount) {
    startTransition(() => {
      setAccounts((prev) => {
        const exists = prev.some((item) => item.id === account.id)
        if (exists) {
          return prev.map((item) => (item.id === account.id ? account : item))
        }
        return [account, ...prev]
      })
    })
    showToast(editing ? "계정을 수정했습니다." : "계정을 추가했습니다.")
  }

  function handleDelete(id: string) {
    const target = accounts.find((a) => a.id === id)
    if (!target) return
    if (!window.confirm(`「${target.characterName}」 계정을 삭제할까요?`)) return
    startTransition(() => {
      setAccounts((prev) => prev.filter((item) => item.id !== id))
    })
    showToast("계정을 삭제했습니다.")
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      showToast(`${label}을(를) 복사했습니다.`)
    } catch {
      showToast("복사에 실패했습니다.")
    }
  }

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(accounts, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `zeus-accounts-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    showToast("계정 목록을 내보냈습니다.")
  }

  function importJson(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown
        if (!Array.isArray(parsed) || parsed.length === 0) {
          showToast("올바른 계정 JSON이 아닙니다.")
          return
        }
        const imported = filterAccounts(parsed)
        if (imported.length === 0) {
          showToast("가져올 계정이 없습니다.")
          return
        }
        setAccounts(imported)
        showToast(`${imported.length}개 계정을 가져왔습니다.`)
      } catch {
        showToast("JSON 파싱에 실패했습니다.")
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
      <header className="zeus-panel animate-rise overflow-hidden rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-[0.7rem] tracking-[0.28em] text-[var(--zeus-gold)] uppercase">
              <Zap className="size-3.5 animate-bolt" aria-hidden />
              Olympus Vault
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-4xl leading-none tracking-[0.04em] text-[var(--zeus-ivory)] sm:text-5xl">
              ZEUS
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-[var(--zeus-mist)]">
              게임 계정을 하나의 공용 목록으로 함께 관리합니다.
            </p>
          </div>
          <div className="relative z-10 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            >
              <Plus className="size-4" />
              계정 추가
            </button>
            <Button type="button" variant="outline" onClick={exportJson} className="gap-1.5">
              <FileDown className="size-4" />
              내보내기
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              <FileUp className="size-4" />
              가져오기
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importJson(file)
                e.target.value = ""
              }}
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
          <Stat label="전체" value={stats.total} />
          <Stat label="사용 중" value={stats.active} />
          <Stat label="휴면" value={stats.resting} />
        </div>
      </header>

      <section className="zeus-panel animate-rise-delay rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="아이디, 캐릭터, 서버, 메모, 게임 검색"
              className="pl-8"
              aria-label="계정 검색"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="상태 필터"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="all">전체 상태</option>
              {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map(
                (status) => (
                  <option key={status} value={status}>
                    {ACCOUNT_STATUS_LABELS[status]}
                  </option>
                )
              )}
            </select>
            <select
              aria-label="게임 필터"
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="all">모든 게임</option>
              {GAMES.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.label}
                </option>
              ))}
            </select>
            <select
              aria-label="정렬"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="updated">최근 수정</option>
              <option value="level">레벨 높은순</option>
              <option value="name">캐릭터명</option>
            </select>
            {syncing ? (
              <span className="self-center text-xs text-muted-foreground">
                동기화 중…
              </span>
            ) : null}
          </div>
        </div>

        <Separator className="my-4" />

        {filtered.length === 0 ? (
          <EmptyState
            title={accounts.length === 0 ? "계정이 없습니다" : "검색 결과 없음"}
            description={
              accounts.length === 0
                ? "첫 계정을 추가하세요."
                : "다른 검색어나 필터를 시도해 보세요."
            }
            action={
              accounts.length === 0 ? (
                <Button onClick={openCreate} className="gap-1.5">
                  <Plus className="size-4" />
                  계정 추가
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul
            className={`grid gap-2 ${isPending ? "opacity-70" : ""}`}
            aria-live="polite"
          >
            {filtered.map((account, index) => {
              const revealed = revealedIds.has(account.id)
              return (
                <li
                  key={account.id}
                  className="account-row group grid gap-3 rounded-xl px-3 py-3 transition-colors sm:grid-cols-[1fr_auto] sm:items-center"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-[var(--zeus-gold)]/40 font-mono text-[0.65rem] tracking-wide text-[var(--zeus-gold)]"
                      >
                        {gameBadge(account.game)}
                      </Badge>
                      <p className="font-[family-name:var(--font-display)] text-lg tracking-wide text-[var(--zeus-ivory)]">
                        {account.characterName}
                      </p>
                      <Badge variant={STATUS_BADGE[account.status]}>
                        {ACCOUNT_STATUS_LABELS[account.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Lv.{account.level} · {account.server}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--zeus-mist)]">
                      <span className="font-mono text-[0.8rem]">
                        {account.username}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono text-[0.8rem]">
                        {revealed ? account.password : "••••••••"}
                        <button
                          type="button"
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          onClick={() => toggleReveal(account.id)}
                          aria-label={
                            revealed ? "비밀번호 숨기기" : "비밀번호 보기"
                          }
                        >
                          {revealed ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        최근 {account.lastPlayedAt}
                      </span>
                    </div>
                    {account.notes ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {account.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() =>
                        copyText(
                          "로그인 정보",
                          `${account.username}\n${account.password}`
                        )
                      }
                    >
                      <Copy className="size-3.5" />
                      복사
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(account)}
                    >
                      <Pencil className="size-3.5" />
                      <span className="sr-only sm:not-sr-only sm:ml-1">
                        수정
                      </span>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">더보기</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => copyText("아이디", account.username)}
                        >
                          아이디 복사
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            copyText("비밀번호", account.password)
                          }
                        >
                          비밀번호 복사
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(account.id)}
                        >
                          <Trash2 className="size-4" />
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <AccountFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editing}
        onSave={handleSave}
      />

      {toast ? (
        <div
          className="animate-toast fixed right-4 bottom-4 z-50 rounded-lg bg-[var(--zeus-navy)] px-4 py-2.5 text-sm text-[var(--zeus-ivory)] shadow-lg ring-1 ring-[var(--zeus-gold)]/30"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2.5 ring-1 ring-white/8">
      <p className="text-[0.65rem] tracking-[0.18em] text-[var(--zeus-mist)] uppercase">
        {label}
      </p>
      <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--zeus-gold)]">
        {value}
      </p>
    </div>
  )
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <Zap className="size-8 text-[var(--zeus-gold)]/70" aria-hidden />
      <div className="space-y-1">
        <p className="font-[family-name:var(--font-display)] text-xl tracking-wide">
          {title}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}
