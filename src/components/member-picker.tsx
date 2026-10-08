"use client"

import { Zap } from "lucide-react"
import { VAULT_MEMBERS, memberName, type MemberId, type MemberNames } from "@/lib/members"

export function MemberPicker({
  names,
  onSelect,
}: {
  names: MemberNames
  onSelect: (memberId: MemberId) => void
}) {
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
            이번 접속의 사용자를 선택하세요.
          </p>
        </div>
        <div className="mt-6 grid gap-3">
          {VAULT_MEMBERS.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onSelect(member.id)}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-[rgba(212,162,76,0.35)] bg-primary/10 px-3 text-sm font-medium text-[var(--zeus-ivory)] transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {memberName(member.id, names)}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
