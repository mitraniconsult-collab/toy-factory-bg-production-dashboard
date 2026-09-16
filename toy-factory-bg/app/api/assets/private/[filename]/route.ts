import { NextRequest } from "next/server";
import { GET as servePrivateAsset } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return servePrivateAsset(request);
}
