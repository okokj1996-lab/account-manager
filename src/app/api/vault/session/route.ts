import { NextResponse } from "next/server"
import {
  applyVaultSessionCookie,
  clearVaultSessionCookie,
  createVaultSessionToken,
  hasValidVaultSession,
  isVaultAuthConfigured,
  verifyVaultAccessPassword,
} from "@/lib/vault-auth"

const UNAVAILABLE = "지금은 접속할 수 없습니다."
const DENIED = "비밀번호가 올바르지 않습니다."

async function readPassword(request: Request): Promise<string | null> {
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (text.length === 0 || text.length > 4096) return null
  try {
    const body = JSON.parse(text) as { password?: unknown }
    return typeof body.password === "string" ? body.password : null
  } catch {
    return null
  }
}

export async function GET() {
  return NextResponse.json({ ok: await hasValidVaultSession() })
}

export async function POST(request: Request) {
  if (!isVaultAuthConfigured()) {
    console.error("[vault-auth] configuration rejected")
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }
  const password = await readPassword(request)
  if (password === null) {
    return NextResponse.json({ error: DENIED }, { status: 401 })
  }
  const result = await verifyVaultAccessPassword(password)
  if (result === "unavailable") {
    console.error("[vault-auth] configuration rejected")
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }
  if (result !== "ok") {
    return NextResponse.json({ error: DENIED }, { status: 401 })
  }
  const token = createVaultSessionToken()
  if (!token) {
    console.error("[vault-auth] configuration rejected")
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }
  const response = NextResponse.json({ ok: true })
  applyVaultSessionCookie(response, token)
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  clearVaultSessionCookie(response)
  return response
}
