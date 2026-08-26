import { NextResponse } from "next/server";

// Keep compatibility with cached browser clients without retaining public telemetry.
export async function POST() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
