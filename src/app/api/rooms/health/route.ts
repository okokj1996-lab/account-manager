import { NextResponse } from "next/server"
import { hasCloudRoomStore, isServerlessRuntime } from "@/lib/rooms"
import { requireVaultSession } from "@/lib/vault-auth"

export async function GET() {
  const denied = await requireVaultSession()
  if (denied) return denied
  const cloudStore = hasCloudRoomStore()
  const serverless = isServerlessRuntime()
  return NextResponse.json({
    ok: !serverless || cloudStore,
    cloudStore,
    serverless,
    message:
      serverless && !cloudStore
        ? "Vercel에 Upstash Redis(KV)를 연결한 뒤 다시 배포하세요."
        : "공유 방 준비 완료",
  })
}
