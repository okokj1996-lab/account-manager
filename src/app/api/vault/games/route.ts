import { NextResponse } from "next/server"
import { addGame, readGameDirectory } from "@/lib/game-directory"
import { requireVaultSession } from "@/lib/vault-auth"

function failureResponse(error: unknown): NextResponse {
  if (error instanceof Error && error.message.startsWith("CLOUD_STORE_MISSING")) {
    return NextResponse.json(
      { error: "공유 저장소가 없습니다. Vercel에 Upstash Redis(KV)를 연결하세요." },
      { status: 503 }
    )
  }
  console.error("[vault-games] request failed")
  return NextResponse.json({ error: "게임 목록을 처리하지 못했습니다." }, { status: 500 })
}

function writeError(result: { reason: string }): NextResponse {
  if (result.reason === "invalid-name") {
    return NextResponse.json({ error: "게임 이름은 1~30자로 입력하세요." }, { status: 400 })
  }
  if (result.reason === "duplicate-name") {
    return NextResponse.json(
      { error: "DUPLICATE_NAME", message: "같은 이름의 게임이 이미 있습니다." },
      { status: 409 }
    )
  }
  return NextResponse.json(
    { error: "다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요." },
    { status: 503 }
  )
}

export async function GET() {
  const denied = await requireVaultSession()
  if (denied) return denied
  try {
    const directory = await readGameDirectory()
    return NextResponse.json({
      games: directory.games,
      updatedAt: directory.updatedAt,
    })
  } catch (error) {
    return failureResponse(error)
  }
}

export async function POST(request: Request) {
  const denied = await requireVaultSession()
  if (denied) return denied
  let name: unknown
  try {
    const body = (await request.json()) as { name?: unknown }
    name = body.name
  } catch {
    return NextResponse.json({ error: "게임 이름은 1~30자로 입력하세요." }, { status: 400 })
  }
  try {
    const result = await addGame(name)
    if (!result.ok) return writeError(result)
    return NextResponse.json({
      games: result.directory.games,
      updatedAt: result.directory.updatedAt,
    })
  } catch (error) {
    return failureResponse(error)
  }
}
