import { createServer } from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { requireDatabaseReady } from "./lib/server/startup-database";

loadEnvConfig(process.cwd());
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: "production" });
}

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "", 10) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function bootstrap(): Promise<void> {
  console.log("[BOOT] Starting database bootstrap...");
  const { AppDataSource, isDatabaseConfigured } = await import("./lib/db.shared");
  await requireDatabaseReady({
    dataSource: AppDataSource,
    isConfigured: isDatabaseConfigured,
  });
  console.log("[BOOT] Database bootstrap completed successfully");
  console.log("[BOOT] Starting Next.js server...");
}

async function listen(): Promise<void> {
  const server = createServer((request, response) => handle(request, response));
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, hostname, () => {
      server.off("error", onError);
      console.log(`> Ready on http://${hostname}:${port}`);
      resolve();
    });
  });
}

async function startServer(): Promise<void> {
  try {
    await bootstrap();
    await app.prepare();
    await listen();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exitCode = 1;
  }
}

void startServer();
