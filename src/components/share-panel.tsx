"use client"

import { useEffect, useState } from "react"
import { Copy, Link2, LogOut, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ZeusAccount } from "@/lib/types"

type SharePanelProps = {
  roomCode: string | null
  syncing: boolean
  accounts: ZeusAccount[]
  onJoined: (code: string, accounts: ZeusAccount[], updatedAt: string) => void
  onLeft: () => void
  onToast: (message: string) => void
}

export function SharePanel({
  roomCode,
  syncing,
  accounts,
  onJoined,
  onLeft,
  onToast,
}: SharePanelProps) {
  const [joinCode, setJoinCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [setupHint, setSetupHint] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch("/api/rooms/health")
        if (!res.ok) return
        const data = (await res.json()) as {
          ok?: boolean
          message?: string
        }
        if (!cancelled && data.ok === false) {
          setSetupHint(
            data.message ||
              "Vercel에 Upstash Redis(KV)를 연결한 뒤 다시 배포하세요."
          )
        }
      } catch {
        // ignore
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  async function createRoom() {
    const typed = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (joinCode.trim() && (typed.length < 4 || typed.length > 12)) {
      onToast("방 코드는 영문과 숫자 4~12자리로 입력하세요.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accounts,
          ...(typed ? { code: typed } : {}),
        }),
      })
      const data = (await res.json()) as {
        code?: string
        accounts?: ZeusAccount[]
        updatedAt?: string
        error?: string
      }
      if (!res.ok || !data.code || !data.accounts || !data.updatedAt) {
        onToast(data.error || "공유 방을 만들지 못했습니다.")
        return
      }
      onJoined(data.code, data.accounts, data.updatedAt)
      setJoinCode("")
      const url = `${window.location.origin}/?room=${data.code}`
      try {
        await navigator.clipboard.writeText(url)
        onToast(`공유 방 ${data.code} 생성 · 초대 링크 복사됨`)
      } catch {
        onToast(`공유 방 ${data.code}을 만들었습니다.`)
      }
    } catch {
      onToast("공유 방을 만들지 못했습니다.")
    } finally {
      setBusy(false)
    }
  }

  async function joinRoom(codeInput: string) {
    const code = codeInput.trim().toUpperCase()
    if (!code) {
      onToast("방 코드를 입력하세요.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`)
      if (!res.ok) {
        let message =
          res.status === 404 ? "방을 찾을 수 없습니다." : "방 참가에 실패했습니다."
        try {
          const data = (await res.json()) as { error?: unknown }
          if (typeof data.error === "string") message = data.error
        } catch {
          // ignore a non-JSON error body
        }
        onToast(message)
        return
      }
      const room = (await res.json()) as {
        code: string
        updatedAt: string
        accounts: ZeusAccount[]
      }
      onJoined(room.code, room.accounts, room.updatedAt)
      onToast(`${room.code} 방에 참가했습니다.`)
      setJoinCode("")
    } catch {
      onToast("방 참가에 실패했습니다.")
    } finally {
      setBusy(false)
    }
  }

  async function copyInvite() {
    if (!roomCode) return
    const url = `${window.location.origin}/?room=${roomCode}`
    try {
      await navigator.clipboard.writeText(url)
      onToast("초대 링크를 복사했습니다.")
    } catch {
      onToast(`방 코드: ${roomCode}`)
    }
  }

  return (
    <section className="zeus-panel rounded-2xl p-4 sm:p-5">
      {setupHint ? (
        <p className="mb-3 rounded-lg bg-destructive/15 px-3 py-2 text-sm text-[var(--zeus-ivory)] ring-1 ring-destructive/40">
          공유 방 준비 안 됨: {setupHint}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--zeus-ivory)]">
            <Users className="size-4 text-[var(--zeus-gold)]" />
            친구와 공유
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            개인 계정은 이 브라우저에 남고, 공유 계정은 같은 방 코드의 서버
            목록입니다. 마지막 방 코드만 기억해서 다음에 다시 들어갑니다.
          </p>
        </div>
        {roomCode ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-black/25 px-3 py-1.5 font-mono text-sm tracking-widest text-[var(--zeus-gold)] ring-1 ring-[var(--zeus-gold)]/30">
              {roomCode}
            </span>
            {syncing ? (
              <span className="text-xs text-muted-foreground">동기화 중…</span>
            ) : (
              <span className="text-xs text-muted-foreground">공유 중</span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={copyInvite}
            >
              <Link2 className="size-3.5" />
              초대 링크
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                void navigator.clipboard.writeText(roomCode)
                onToast("방 코드를 복사했습니다.")
              }}
            >
              <Copy className="size-3.5" />
              코드 복사
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={onLeft}
            >
              <LogOut className="size-3.5" />
              나가기
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="예: 1996S"
              className="w-36 font-mono tracking-wider"
              aria-label="만들거나 참가할 방 코드"
              maxLength={12}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || busy) return
                e.preventDefault()
                void createRoom()
              }}
            />
            <Button
              type="button"
              onClick={createRoom}
              disabled={busy}
              className="gap-1.5"
              title="입력한 코드로 방을 만듭니다. 비우면 자동으로 만듭니다."
            >
              <Users className="size-4" />
              공유 방 만들기
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => joinRoom(joinCode)}
            >
              참가
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
