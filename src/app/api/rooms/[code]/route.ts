import { NextResponse } from "next/server"
import {
  encryptionErrorMessage,
  encryptionErrorStatus,
} from "@/lib/password-crypto"
import { normalizeRoomCode, readRoom, writeRoom } from "@/lib/rooms"
import { filterAccounts } from "@/lib/validate"
import { requireVaultSession } from "@/lib/vault-auth"

function encryptionResponse(error: unknown): NextResponse | null {
  const message = encryptionErrorMessage(error)
  const status = encryptionErrorStatus(error)
  if (!message || !status) return null
  console.error(
    "[rooms] password crypto failed",
    error instanceof Error ? error.message : "unknown"
  )
  return NextResponse.json({ error: message }, { status })
}

type RouteContext = {
  params: Promise<{ code: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const denied = await requireVaultSession()
  if (denied) return denied
  const { code: raw } = await context.params
  const code = normalizeRoomCode(raw)
  if (!code) {
    return NextResponse.json({ error: "잘못된 방 코드입니다." }, { status: 400 })
  }
  try {
    const room = await readRoom(code)
    if (!room) {
      return NextResponse.json({ error: "방을 찾을 수 없습니다." }, { status: 404 })
    }
    return NextResponse.json(room)
  } catch (error) {
    return (
      encryptionResponse(error) ??
      NextResponse.json({ error: "공유 방을 읽지 못했습니다." }, { status: 500 })
    )
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const denied = await requireVaultSession()
  if (denied) return denied
  const { code: raw } = await context.params
  const code = normalizeRoomCode(raw)
  if (!code) {
    return NextResponse.json({ error: "잘못된 방 코드입니다." }, { status: 400 })
  }
  try {
    const body = (await request.json()) as {
      accounts?: unknown
      baseUpdatedAt?: unknown
    }
    const accounts = filterAccounts(body.accounts)
    const baseUpdatedAt =
      typeof body.baseUpdatedAt === "string" && body.baseUpdatedAt
        ? body.baseUpdatedAt
        : undefined
    const result = await writeRoom(code, accounts, baseUpdatedAt)
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ error: "방을 찾을 수 없습니다." }, { status: 404 })
    }
    if (!result.ok && result.reason === "conflict") {
      return NextResponse.json(
        { error: "다른 수정이 먼저 저장되었습니다.", room: result.room },
        { status: 409 }
      )
    }
    if (!result.ok) {
      return NextResponse.json({ error: "방을 찾을 수 없습니다." }, { status: 404 })
    }
    return NextResponse.json(result.room)
  } catch (error) {
    return (
      encryptionResponse(error) ??
      NextResponse.json(
        { error: "공유 방 저장에 실패했습니다." },
        { status: 500 }
      )
    )
  }
}
