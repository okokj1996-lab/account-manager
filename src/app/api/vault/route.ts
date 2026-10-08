import { NextResponse } from "next/server"
import {
  encryptionErrorMessage,
  encryptionErrorStatus,
} from "@/lib/password-crypto"
import { readVault, writeVault } from "@/lib/rooms"
import { filterAccounts } from "@/lib/validate"

function failureResponse(error: unknown): NextResponse {
  const message = encryptionErrorMessage(error)
  const status = encryptionErrorStatus(error)
  if (message && status) {
    console.error(
      "[vault] password crypto failed",
      error instanceof Error ? error.message : "unknown"
    )
    return NextResponse.json({ error: message }, { status })
  }
  if (error instanceof Error && error.message === "VAULT_INVALID") {
    console.error("[vault] stored document could not be parsed")
    return NextResponse.json(
      {
        error:
          "공용 Vault 데이터를 해석하지 못했습니다. 저장된 데이터는 변경하지 않았습니다.",
      },
      { status: 500 }
    )
  }
  if (error instanceof Error && error.message.startsWith("CLOUD_STORE_MISSING")) {
    return NextResponse.json(
      {
        error:
          "공유 저장소가 없습니다. Vercel에 Upstash Redis(KV)를 연결하세요.",
      },
      { status: 503 }
    )
  }
  console.error("[vault] request failed")
  return NextResponse.json(
    { error: "공용 Vault를 처리하지 못했습니다." },
    { status: 500 }
  )
}

export async function GET() {
  try {
    const vault = await readVault()
    return NextResponse.json(vault)
  } catch (error) {
    return failureResponse(error)
  }
}

export async function PUT(request: Request) {
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
    const result = await writeVault(accounts, baseUpdatedAt)
    if (!result.ok && result.reason === "conflict") {
      return NextResponse.json(
        { error: "다른 수정이 먼저 저장되었습니다.", room: result.room },
        { status: 409 }
      )
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: "공용 Vault를 저장하지 못했습니다." },
        { status: 404 }
      )
    }
    return NextResponse.json(result.room)
  } catch (error) {
    return failureResponse(error)
  }
}
