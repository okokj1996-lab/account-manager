import { NextResponse } from "next/server"
import { deleteGame, renameGame } from "@/lib/game-directory"
import { readVault } from "@/lib/rooms"
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
  console.error("[vault-games] request failed")
  return NextResponse.json({ error: "게임을 처리하지 못했습니다." }, { status: 500 })
}

function invalidId(id: string): boolean {
  const trimmed = id.trim()
  return !trimmed || trimmed.length > 80 || /\s/.test(trimmed)
}

export async function PUT(request: Request, context: RouteContext) {
  const denied = await requireVaultSession()
  if (denied) return denied
  const { id } = await context.params
  if (invalidId(id)) {
    return NextResponse.json({ error: "게임을 확인할 수 없습니다." }, { status: 400 })
  }
  let name: unknown
  try {
    const body = (await request.json()) as { name?: unknown }
    name = body.name
  } catch {
    return NextResponse.json({ error: "게임 이름은 1~30자로 입력하세요." }, { status: 400 })
  }
  try {
    const result = await renameGame(id, name)
    if (!result.ok && result.reason === "invalid-name") {
      return NextResponse.json({ error: "게임 이름은 1~30자로 입력하세요." }, { status: 400 })
    }
    if (!result.ok && result.reason === "duplicate-name") {
      return NextResponse.json(
        { error: "DUPLICATE_NAME", message: "같은 이름의 게임이 이미 있습니다." },
        { status: 409 }
      )
    }
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ error: "게임을 확인할 수 없습니다." }, { status: 404 })
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: "다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 }
      )
    }
    return NextResponse.json({
      games: result.directory.games,
      updatedAt: result.directory.updatedAt,
    })
  } catch (error) {
    return failureResponse(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await requireVaultSession()
  if (denied) return denied
  const { id } = await context.params
  if (invalidId(id)) {
    return NextResponse.json({ error: "게임을 확인할 수 없습니다." }, { status: 400 })
  }
  try {
    const result = await deleteGame(id, async (gameId) => {
      const vault = await readVault()
      return vault.accounts.filter((account) => account.game === gameId).length
    })
    if (!result.ok && result.reason === "in-use") {
      return NextResponse.json(
        { error: "GAME_IN_USE", accountCount: result.accountCount ?? 0 },
        { status: 409 }
      )
    }
    if (!result.ok && result.reason === "last-game") {
      return NextResponse.json({ error: "LAST_GAME" }, { status: 409 })
    }
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ error: "게임을 확인할 수 없습니다." }, { status: 404 })
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: "다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 }
      )
    }
    return NextResponse.json({
      games: result.directory.games,
      updatedAt: result.directory.updatedAt,
    })
  } catch (error) {
    return failureResponse(error)
  }
}
