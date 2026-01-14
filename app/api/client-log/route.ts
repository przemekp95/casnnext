// app/api/client-log/route.ts
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json().catch(() => ({}));
    const line = `[${new Date().toISOString()}] ${data.type || "client"} ${data.message || ""} ${data.stack || ""} ${data.source || ""}\n`;

    // Zapisz w tmp/ (działa tak samo lokalnie i na hostingu)
    const root = process.cwd();
    const logDir = path.join(root, "tmp");
    const logFile = path.join(logDir, "client.log");
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logFile, line, "utf8");

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
