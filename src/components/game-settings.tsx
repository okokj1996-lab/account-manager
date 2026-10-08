"use client"

import { useState } from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { gamesFromList, type VaultGame } from "@/lib/games"
import type { ZeusAccount } from "@/lib/types"

export function GameSettings({
  games,
  accounts,
  onUpdated,
  onOpen,
}: {
  games: VaultGame[]
  accounts: ZeusAccount[]
  onUpdated: (games: VaultGame[], updatedAt: string) => void
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function resetEditor(force = false) {
    if (saving && !force) return
    setEditing(null)
    setConfirming(null)
    setAdding(false)
    setDraft("")
    setError(null)
  }

  function applyResponse(data: { games?: unknown; updatedAt?: unknown }) {
    onUpdated(gamesFromList(data.games), typeof data.updatedAt === "string" ? data.updatedAt : "")
    resetEditor(true)
  }

  async function readError(res: Response): Promise<string> {
    try {
      const data = (await res.json()) as { error?: unknown; message?: unknown; accountCount?: unknown }
      if (data.error === "GAME_IN_USE") {
        const count = typeof data.accountCount === "number" ? data.accountCount : 0
        return `이 게임에 등록된 계정 ${count}개가 있어 삭제할 수 없습니다.`
      }
      if (data.error === "LAST_GAME") return "마지막 게임은 삭제할 수 없습니다."
      if (data.error === "DUPLICATE_NAME" || data.message === "같은 이름의 게임이 이미 있습니다.") {
        return "같은 이름의 게임이 이미 있습니다."
      }
      if (typeof data.error === "string" && data.error !== "GAME_IN_USE") return data.error
    } catch {
      // ignore a non-JSON error body
    }
    return "게임을 처리하지 못했습니다."
  }

  async function createGame() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/vault/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft }),
      })
      if (!res.ok) {
        setError(await readError(res))
        return
      }
      applyResponse((await res.json()) as { games?: unknown; updatedAt?: unknown })
    } catch {
      setError("게임을 추가하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function saveName() {
    if (!editing || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/vault/games/${encodeURIComponent(editing)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft }),
      })
      if (!res.ok) {
        setError(await readError(res))
        return
      }
      applyResponse((await res.json()) as { games?: unknown; updatedAt?: unknown })
    } catch {
      setError("게임 이름을 바꾸지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function removeGame(id: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/vault/games/${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!res.ok) {
        setError(await readError(res))
        return
      }
      applyResponse((await res.json()) as { games?: unknown; updatedAt?: unknown })
    } catch {
      setError("게임을 삭제하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="게임 관리"
        className="rounded p-1 text-[var(--zeus-mist)] hover:text-[var(--zeus-gold)]"
        onClick={() => {
          onOpen?.()
          setOpen(true)
        }}
      >
        <Settings className="size-4" aria-hidden />
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) resetEditor()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>게임 관리</DialogTitle>
            <DialogDescription>Vault에서 사용할 게임을 관리합니다.</DialogDescription>
          </DialogHeader>
          <ul className="grid max-h-[50vh] gap-3 overflow-y-auto">
            {games.map((game) => {
              const count = accounts.filter((account) => account.game === game.id).length
              const lastGame = games.length <= 1
              return (
                <li key={game.id} className="grid gap-2 rounded-lg border border-white/8 px-3 py-3">
                  {editing === game.id ? (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-label={`${game.name} 이름`}
                        disabled={saving}
                        maxLength={30}
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => void saveName()} disabled={saving}>
                          저장
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => resetEditor()} disabled={saving}>
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : confirming === game.id ? (
                    <div className="grid gap-2">
                      <p className="text-sm text-[var(--zeus-ivory)]">
                        '{game.name}' 게임을 삭제하시겠습니까?
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void removeGame(game.id)}
                          disabled={saving}
                        >
                          삭제
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => resetEditor()} disabled={saving}>
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--zeus-ivory)]">{game.name}</p>
                        <p className="text-xs text-[var(--zeus-mist)]">등록 계정 {count}개</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAdding(false)
                            setConfirming(null)
                            setEditing(game.id)
                            setDraft(game.name)
                            setError(null)
                          }}
                        >
                          이름 수정
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={count > 0 || lastGame}
                          onClick={() => {
                            setAdding(false)
                            setEditing(null)
                            setConfirming(game.id)
                            setError(null)
                          }}
                        >
                          삭제
                        </Button>
                      </div>
                    </div>
                  )}
                  {count > 0 ? (
                    <p className="text-xs text-[var(--zeus-mist)]">
                      이 게임에 등록된 계정 {count}개가 있어 삭제할 수 없습니다.
                    </p>
                  ) : lastGame ? (
                    <p className="text-xs text-[var(--zeus-mist)]">마지막 게임은 삭제할 수 없습니다.</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {adding ? (
            <div className="grid gap-2">
              <label htmlFor="new-game-name" className="text-sm text-[var(--zeus-ivory)]">
                게임 이름
              </label>
              <Input
                id="new-game-name"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={saving}
                maxLength={30}
                placeholder="리니지M"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void createGame()} disabled={saving}>
                  추가
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => resetEditor()} disabled={saving}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(null)
                setConfirming(null)
                setAdding(true)
                setDraft("")
                setError(null)
              }}
            >
              + 게임 추가
            </Button>
          )}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
