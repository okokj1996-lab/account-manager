import { NextResponse } from "next/server"
import { readMemberDirectory } from "@/lib/member-directory"
import { VAULT_MEMBERS } from "@/lib/members"
import { requireVaultSession } from "@/lib/vault-auth"

function failureResponse(error: unknown): NextResponse {
  if (error instanceof Error && error.message.startsWith("CLOUD_STORE_MISSING")) {
    return NextResponse.json(
      { error: "공유 저장소가 없습니다. Vercel에 Upstash Redis(KV)를 연결하세요." },
      { status: 503 }
    )
  }
  console.error("[vault-members] request failed")
  return NextResponse.json({ error: "사용자 이름을 불러오지 못했습니다." }, { status: 500 })
}

export async function GET() {
  const denied = await requireVaultSession()
  if (denied) return denied
  try {
    const directory = await readMemberDirectory()
    return NextResponse.json({
      members: VAULT_MEMBERS.map((member) => ({
        id: member.id,
        name: directory.names[member.id],
      })),
      updatedAt: directory.updatedAt,
    })
  } catch (error) {
    return failureResponse(error)
  }
}
