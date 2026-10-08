"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  VAULT_MEMBERS,
  memberName,
  memberNamesFromList,
  type MemberId,
  type MemberNames,
} from "@/lib/members"

export function MemberSettings({
  names,
  onUpdated,
}: {
  names: MemberNames
  onUpdated: (names: MemberNames, updatedAt: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<MemberId | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function startEdit(id: MemberId) {
    setEditing(id)
    setDraft(memberName(id, names))
    setError(null)
  }

  function cancelEdit() {
    if (saving) return
    setEditing(null)
    setDraft("")
    setError(null)
  }

  async function save() {
    if (!editing || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/vault/members/${editing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft }),
      })
      if (!res.ok) {
        let message = "이름을 바꾸지 못했습니다."
        try {
          const data = (await res.json()) as { error?: unknown }
          if (typeof data.error === "string") message = data.error
        } catch {
          // ignore a non-JSON error body
        }
        setError(message)
        return
      }
      const data = (await res.json()) as { members?: unknown; updatedAt?: unknown }
      onUpdated(memberNamesFromList(data.members), typeof data.updatedAt === "string" ? data.updatedAt : "")
      setEditing(null)
      setDraft("")
    } catch {
      setError("이름을 바꾸지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        사용자 관리
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) cancelEdit()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사용자 관리</DialogTitle>
            <DialogDescription>표시 이름만 바꿀 수 있습니다.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-3">
            {VAULT_MEMBERS.map((member) => (
              <li
                key={member.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                {editing === member.id ? (
                  <>
                    <Input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      aria-label={`${memberName(member.id, names)} 이름`}
                      disabled={saving}
                      maxLength={20}
                      className="min-w-0 sm:max-w-xs"
                    />
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
                        저장
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        취소
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-[var(--zeus-ivory)]">
                      {memberName(member.id, names)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(member.id)}
                    >
                      이름 수정
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
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
