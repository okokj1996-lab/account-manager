import { NextResponse } from "next/server"
import { normalizeRoomCode, readRoom, writeRoom } from "@/lib/rooms"
import { filterAccounts } from "@/lib/validate"

type RouteContext = {
  params: Promise<{ code: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { code: raw } = await context.params
  const code = normalizeRoomCode(raw)
  if (!code) {
    return NextResponse.json({ error: "잘못된 방 코드입니다." }, { status: 400 })
  }
  const room = await readRoom(code)
  if (!room) {
    return NextResponse.json({ error: "방을 찾을 수 없습니다." }, { status: 404 })
  }
  return NextResponse.json(room)
}

export async function PUT(request: Request, context: RouteContext) {
  const { code: raw } = await context.params
  const code = normalizeRoomCode(raw)
  if (!code) {
    return NextResponse.json({ error: "잘못된 방 코드입니다." }, { status: 400 })
  }
  try {
    const body = (await request.json()) as { accounts?: unknown }
    const accounts = filterAccounts(body.accounts)
    const room = await writeRoom(code, accounts)
    if (!room) {
      return NextResponse.json({ error: "방을 찾을 수 없습니다." }, { status: 404 })
    }
    return NextResponse.json(room)
  } catch {
    return NextResponse.json(
      { error: "공유 방 저장에 실패했습니다." },
      { status: 500 }
    )
  }
}
