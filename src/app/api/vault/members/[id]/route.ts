import { NextResponse } from "next/server"
import { renameMember } from "@/lib/member-directory"
import { VAULT_MEMBERS, isMemberId } from "@/lib/members"
import { requireVaultSession } from "@/lib/vault-auth"

type RouteContext = {
  params: Promise<{ id: string }>
}

function failureResponse(error: unknown): NextResponse {
  if (error instanceof Error && error.message.startsWith("CLOUD_STORE_MISSING")) {
    return NextResponse.json(
      { error: "공유 저장소가 없습니다. Vercel에 Upstash Redis(KV)를 연결하세요." },
      { status: 503 }
    )
  }
  console.error("[vault-members] request failed")
  return NextResponse.json({ error: "사용자 이름을 바꾸지 못했습니다." }, { status: 500 })
}

export async function PUT(request: Request, context: RouteContext) {
  const denied = await requireVaultSession()
  if (denied) return denied
  const { id } = await context.params
  if (!isMemberId(id)) {
    return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 400 })
  }
  let name: unknown
  try {
    const body = (await request.json()) as { name?: unknown }
    name = body.name
  } catch {
    return NextResponse.json({ error: "이름은 1~20자로 입력하세요." }, { status: 400 })
  }
  try {
    const result = await renameMember(id, name)
    if (!result.ok && result.reason === "invalid-name") {
      return NextResponse.json({ error: "이름은 1~20자로 입력하세요." }, { status: 400 })
    }
    if (!result.ok && result.reason === "invalid-id") {
      return NextResponse.json({ error: "사용자를 확인할 수 없습니다." }, { status: 400 })
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: "다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 }
      )
    }
    return NextResponse.json({
      members: VAULT_MEMBERS.map((member) => ({
        id: member.id,
        name: result.directory.names[member.id],
      })),
      updatedAt: result.directory.updatedAt,
    })
  } catch (error) {
    return failureResponse(error)
  }
}
