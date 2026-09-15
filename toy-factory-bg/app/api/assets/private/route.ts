import { NextRequest, NextResponse } from "next/server";
import { verifyAssetAccess } from "@/lib/asset-access";
import { fetchPrivateAsset } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") || "";
  const expiresAt = Number(request.nextUrl.searchParams.get("exp") || "0");
  const signature = request.nextUrl.searchParams.get("sig") || "";

  let authorized = false;
  try {
    authorized = verifyAssetAccess(path, expiresAt, signature);
  } catch {
    authorized = false;
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized or expired asset URL" }, { status: 401 });
  }

  try {
    const storageResponse = await fetchPrivateAsset(path);
    return new NextResponse(storageResponse.body, {
      status: 200,
      headers: {
        "Content-Type": storageResponse.headers.get("content-type") || "application/octet-stream",
        ...(storageResponse.headers.get("content-length")
          ? { "Content-Length": storageResponse.headers.get("content-length") as string }
          : {}),
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Temporary asset proxy failed", { path, error });
    return NextResponse.json(
      { error: "Could not read private asset" },
      { status: 502 }
    );
  }
}
