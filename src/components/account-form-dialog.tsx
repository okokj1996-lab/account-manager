"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DEFAULT_GAME_ID, GAMES, gameLabel } from "@/lib/games"
import {
  ACCOUNT_STATUS_LABELS,
  SERVER_OPTIONS,
  type AccountStatus,
  type ZeusAccount,
} from "@/lib/types"
import { createId } from "@/lib/storage"

type FormState = {
  game: string
  username: string
  password: string
  characterName: string
  server: string
  level: string
  status: AccountStatus
  notes: string
  lastPlayedAt: string
}

const emptyForm: FormState = {
  game: DEFAULT_GAME_ID,
  username: "",
  password: "",
  characterName: "",
  server: SERVER_OPTIONS[0],
  level: "1",
  status: "active",
  notes: "",
  lastPlayedAt: new Date().toISOString().slice(0, 10),
}

type AccountFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: ZeusAccount | null
  onSave: (account: ZeusAccount) => void
}

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  onSave,
}: AccountFormDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    if (account) {
      setForm({
        game: account.game || DEFAULT_GAME_ID,
        username: account.username,
        password: account.password,
        characterName: account.characterName,
        server: account.server,
        level: String(account.level),
        status: account.status,
        notes: account.notes,
        lastPlayedAt: account.lastPlayedAt.slice(0, 10),
      })
    } else {
      setForm(emptyForm)
    }
    setError("")
  }, [open, account])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const username = form.username.trim()
    const password = form.password.trim()
    const characterName = form.characterName.trim()
    const level = Number(form.level)

    if (!username || !password || !characterName) {
      setError("아이디, 비밀번호, 캐릭터명은 필수입니다.")
      return
    }
    if (!Number.isFinite(level) || level < 1 || level > 999) {
      setError("레벨은 1~999 사이여야 합니다.")
      return
    }

    const now = new Date().toISOString()
    onSave({
      id: account?.id ?? createId(),
      game: form.game || DEFAULT_GAME_ID,
      username,
      password,
      characterName,
      server: form.server,
      level,
      status: form.status,
      notes: form.notes.trim(),
      lastPlayedAt: form.lastPlayedAt || now.slice(0, 10),
      createdAt: account?.createdAt ?? now,
      updatedAt: now,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-[family-name:var(--font-display)] tracking-wide">
              {account ? "계정 수정" : "계정 추가"}
            </DialogTitle>
            <DialogDescription>
              게임과 계정 정보를 입력하세요. 같은 주소로 접속한 사람과
              이 목록을 함께 씁니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Field label="게임" htmlFor="game">
              <select
                id="game"
                value={form.game}
                onChange={(e) => update("game", e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {GAMES.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.label}
                  </option>
                ))}
                {GAMES.every((game) => game.id !== form.game) ? (
                  <option value={form.game}>{gameLabel(form.game)}</option>
                ) : null}
              </select>
            </Field>
            <Field label="아이디" htmlFor="username">
              <Input
                id="username"
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
                placeholder="zeus_main"
                autoComplete="off"
              />
            </Field>
            <Field label="비밀번호" htmlFor="password">
              <Input
                id="password"
                type="text"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="비밀번호"
                autoComplete="off"
              />
            </Field>
            <Field label="캐릭터명" htmlFor="characterName">
              <Input
                id="characterName"
                value={form.characterName}
                onChange={(e) => update("characterName", e.target.value)}
                placeholder="제우스"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="서버" htmlFor="server">
                <select
                  id="server"
                  value={form.server}
                  onChange={(e) => update("server", e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  {SERVER_OPTIONS.map((server) => (
                    <option key={server} value={server}>
                      {server}
                    </option>
                  ))}
                  {!SERVER_OPTIONS.includes(
                    form.server as (typeof SERVER_OPTIONS)[number]
                  ) && <option value={form.server}>{form.server}</option>}
                </select>
              </Field>
              <Field label="레벨" htmlFor="level">
                <Input
                  id="level"
                  type="number"
                  min={1}
                  max={999}
                  value={form.level}
                  onChange={(e) => update("level", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="상태" htmlFor="status">
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) =>
                    update("status", e.target.value as AccountStatus)
                  }
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map(
                    (status) => (
                      <option key={status} value={status}>
                        {ACCOUNT_STATUS_LABELS[status]}
                      </option>
                    )
                  )}
                </select>
              </Field>
              <Field label="최근 접속" htmlFor="lastPlayedAt">
                <Input
                  id="lastPlayedAt"
                  type="date"
                  value={form.lastPlayedAt}
                  onChange={(e) => update("lastPlayedAt", e.target.value)}
                />
              </Field>
            </div>
            <Field label="메모" htmlFor="notes">
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="길드, 용도, 공유 여부 등"
                rows={3}
              />
            </Field>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit">{account ? "저장" : "추가"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
