"use client"

import { useEffect, useState } from "react"
import { Zap } from "lucide-react"
import { AccountManager } from "@/components/account-manager"
import { Input } from "@/components/ui/input"

type Phase = "checking" | "locked" | "open"

const SAFE_ERRORS = new Set([
  "비밀번호가 올바르지 않습니다.",
  "지금은 접속할 수 없습니다.",
])

export function VaultGate() {
  const [phase, setPhase] = useState<Phase>("checking")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch("/api/vault/session")
        const data = (await res.json()) as { ok?: unknown }
        if (!cancelled) setPhase(data.ok === true ? "open" : "locked")
      } catch {
        if (!cancelled) setPhase("locked")
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

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
      setPhase("open")
    } catch {
      setError("접속에 실패했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === "open") {
    return <AccountManager onUnauthorized={() => setPhase("locked")} />
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <section className="zeus-panel animate-rise rounded-2xl px-6 py-8 sm:px-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-[0.7rem] tracking-[0.28em] text-[var(--zeus-gold)] uppercase">
            <Zap className="size-3.5 animate-bolt" aria-hidden />
            Olympus Vault
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-none tracking-[0.04em] text-[var(--zeus-ivory)]">
            ZEUS
          </h1>
          <p className="text-sm leading-relaxed text-[var(--zeus-mist)]">
            {phase === "checking"
              ? "접속 상태를 확인하고 있습니다."
              : "공용 Vault에 들어가려면 접속 비밀번호를 입력하세요."}
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
