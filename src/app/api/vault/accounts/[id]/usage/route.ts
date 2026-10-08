import { NextResponse } from "next/server"
import { isMemberId } from "@/lib/members"
import {
  encryptionErrorMessage,
  encryptionErrorStatus,
} from "@/lib/password-crypto"
import { updateVaultUsage } from "@/lib/rooms"
import { requireVaultSession } from "@/lib/vault-auth"

type RouteContext = {
  params: Promise<{ id: string }>
}

function failureResponse(error: unknown): NextResponse {
  const message = encryptionErrorMessage(error)
  const status = encryptionErrorStatus(error)
  if (message && status) {
    console.error(
      "[vault-usage] password crypto failed",
      error instanceof Error ? error.message : "unknown"
    )
    return NextResponse.json({ error: message }, { status })
  }
  if (error instanceof Error && error.message.startsWith("CLOUD_STORE_MISSING")) {
    return NextResponse.json(
      { error: "공유 저장소가 없습니다. Vercel에 Upstash Redis(KV)를 연결하세요." },
      { status: 503 }
    )
  }
  console.error("[vault-usage] request failed")
  return NextResponse.json(
    { error: "계정 사용 상태를 바꾸지 못했습니다." },
    { status: 500 }
  )
}

export async function POST(request: Request, context: RouteContext) {
  const denied = await requireVaultSession()
  if (denied) return denied
  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 })
  }
  let body: { action?: unknown; memberId?: unknown }
  try {
    body = (await request.json()) as { action?: unknown; memberId?: unknown }
  } catch {
    return NextResponse.json({ error: "요청을 확인할 수 없습니다." }, { status: 400 })
  }
  if (body.action !== "start" && body.action !== "stop") {
    return NextResponse.json({ error: "요청을 확인할 수 없습니다." }, { status: 400 })
  }
  if (!isMemberId(body.memberId)) {
    return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 400 })
  }
  try {
    const result = await updateVaultUsage(id, body.action, body.memberId)
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 })
    }
    if (!result.ok && result.reason === "busy") {
      return NextResponse.json(
        { error: "다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 }
      )
    }
    if (!result.ok && result.reason === "in_use") {
      return NextResponse.json(
        {
          error: "다른 사용자가 이미 이 계정을 사용 중입니다.",
          code: "in_use",
          currentUserId: isMemberId(result.account.currentUserId)
            ? result.account.currentUserId
            : undefined,
        },
        { status: 409 }
      )
    }
    if (!result.ok && result.reason === "not_holder") {
      return NextResponse.json(
        { error: "이 계정을 사용 중인 사람만 종료할 수 있습니다." },
        { status: 409 }
      )
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: "계정 사용 상태를 바꾸지 못했습니다." },
        { status: 500 }
      )
    }
    return NextResponse.json({
      account: result.account,
      updatedAt: result.updatedAt,
    })
  } catch (error) {
    return failureResponse(error)
  }
}
