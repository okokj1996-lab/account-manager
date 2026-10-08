import { NextResponse } from "next/server"
import { createRoom, hasCloudRoomStore, isServerlessRuntime } from "@/lib/rooms"
import { filterAccounts } from "@/lib/validate"

export async function POST(request: Request) {
  try {
    if (isServerlessRuntime() && !hasCloudRoomStore()) {
      return NextResponse.json(
        {
          error:
            "공유 저장소가 없습니다. Vercel 프로젝트에 Upstash Redis(KV)를 연결한 뒤 다시 배포하세요.",
        },
        { status: 503 }
      )
    }
    const body = (await request.json()) as { accounts?: unknown }
    const accounts = filterAccounts(body.accounts)
    const room = await createRoom(accounts)
    return NextResponse.json(room, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "공유 방을 만들지 못했습니다."
    return NextResponse.json(
      {
        error: message.startsWith("CLOUD_STORE_MISSING")
          ? "공유 저장소가 없습니다. Vercel에 Upstash Redis(KV)를 연결하세요."
          : "공유 방을 만들지 못했습니다.",
      },
      { status: 500 }
    )
  }
}
