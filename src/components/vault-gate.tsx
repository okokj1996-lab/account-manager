"use client"

import { useEffect, useRef, useState } from "react"
import { Zap } from "lucide-react"
import { AccountManager } from "@/components/account-manager"
import { MemberPicker } from "@/components/member-picker"
import { Input } from "@/components/ui/input"
import {
  clearStoredMemberId,
  DEFAULT_MEMBER_NAMES,
  memberNamesFromList,
  readStoredMemberId,
  shouldApplyMemberDirectory,
  storeMemberId,
  type MemberId,
  type MemberNames,
} from "@/lib/members"

type Phase = "checking" | "locked" | "open"
type SelectedMember = MemberId | null

const SAFE_ERRORS = new Set([
  "비밀번호가 올바르지 않습니다.",
  "지금은 접속할 수 없습니다.",
])

export function VaultGate() {
  const [phase, setPhase] = useState<Phase>("checking")
  const [memberId, setMemberId] = useState<SelectedMember>(null)
  const [memberReady, setMemberReady] = useState(false)
  const [names, setNames] = useState<MemberNames>(DEFAULT_MEMBER_NAMES)
  const [namesReady, setNamesReady] = useState(false)
  const namesUpdatedAtRef = useRef("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch("/api/vault/session")
        const data = (await res.json()) as { ok?: unknown }
        if (cancelled) return
        if (data.ok === true) {
          setMemberId(readStoredMemberId())
          setMemberReady(true)
          setPhase("open")
          return
        }
        setPhase("locked")
      } catch {
        if (!cancelled) setPhase("locked")
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (phase !== "open") return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/vault/members")
        if (!res.ok) return
        const data = (await res.json()) as { members?: unknown; updatedAt?: unknown }
        if (cancelled) return
        const incoming = {
          names: memberNamesFromList(data.members),
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
        }
        setNames((current) => {
          if (
            !shouldApplyMemberDirectory(
              { names: current, updatedAt: namesUpdatedAtRef.current },
              incoming
            )
          ) {
            return current
          }
          namesUpdatedAtRef.current = incoming.updatedAt
          return incoming.names
        })
      } catch {
        // keep the last known names
      } finally {
        if (!cancelled) setNamesReady(true)
      }
    }
    void load()
    const id = window.setInterval(() => void load(), 3000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [phase])

  function applyNames(next: MemberNames, updatedAt: string) {
    namesUpdatedAtRef.current = updatedAt
    setNames(next)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/vault/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        let message = "접속에 실패했습니다."
        try {
          const data = (await res.json()) as { error?: unknown }
          if (typeof data.error === "string" && SAFE_ERRORS.has(data.error)) {
            message = data.error
          }
        } catch {
          // ignore a non-JSON error body
        }
        setError(message)
        return
      }
      setPassword("")
      setMemberId(readStoredMemberId())
      setMemberReady(true)
      setPhase("open")
    } catch {
      setError("접속에 실패했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === "open" && memberReady && namesReady && memberId) {
    return (
      <AccountManager
        memberId={memberId}
        names={names}
        onNamesUpdated={applyNames}
        onUnauthorized={() => setPhase("locked")}
        onChangeMember={() => {
          clearStoredMemberId()
          setMemberId(null)
        }}
      />
    )
  }

  if (phase === "open" && memberReady && namesReady) {
    return (
      <MemberPicker
        names={names}
        onSelect={(id) => {
          storeMemberId(id)
          setMemberId(id)
        }}
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <section className="zeus-panel animate-rise rounded-2xl px-6 py-8 sm:px-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-[var(--zeus-gold)]">
            <Zap className="size-4 animate-bolt" aria-hidden />
            <h1 className="font-[family-name:var(--font-display)] text-3xl leading-none tracking-[0.06em] text-[var(--zeus-ivory)]">
              OLYMPUS VAULT
            </h1>
          </div>
          <p className="text-sm leading-relaxed text-[var(--zeus-mist)]">
            게임 계정을 하나의 공용 Vault에서 함께 관리합니다.
          </p>
          <p className="text-sm leading-relaxed text-[var(--zeus-mist)]">
            {phase === "locked"
              ? "공용 Vault에 들어가려면 접속 비밀번호를 입력하세요."
              : "접속 상태를 확인하고 있습니다."}
          </p>
        </div>
        {phase === "locked" ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
            <div className="space-y-2">
              <label htmlFor="vault-access-password" className="text-sm text-[var(--zeus-ivory)]">
                접속 비밀번호
              </label>
              <Input
                id="vault-access-password"
                type="password"
                name="vault-access-password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting || password.length === 0}
              className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting ? "확인 중…" : "들어가기"}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  )
}
