import { NextResponse } from "next/server"
import {
  encryptionErrorMessage,
  encryptionErrorStatus,
} from "@/lib/password-crypto"
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
    const body = (await request.json()) as {
      accounts?: unknown
      code?: unknown
    }
    const accounts = filterAccounts(body.accounts)
    const preferredCode = typeof body.code === "string" ? body.code : undefined
    const room = await createRoom(accounts, preferredCode)
    return NextResponse.json(room, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "공유 방을 만들지 못했습니다."
    if (message === "INVALID_ROOM_CODE") {
      return NextResponse.json(
        { error: "방 코드는 영문과 숫자 4~12자리로 입력하세요." },
        { status: 400 }
      )
    }
    if (message === "ROOM_CODE_TAKEN") {
      return NextResponse.json(
        { error: "이미 사용 중인 방 코드입니다. 참가로 들어가 보세요." },
        { status: 409 }
      )
    }
    const encryptionMessage = encryptionErrorMessage(error)
    if (encryptionMessage) {
      console.error("[rooms] password crypto failed", message)
      return NextResponse.json(
        { error: encryptionMessage },
        { status: encryptionErrorStatus(error) ?? 500 }
      )
    }
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
