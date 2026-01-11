// server.js — stały entrypoint (Passenger odpala TYLKO ten plik)
const fs = require("fs");
const path = require("path");

// ENV + katalogi
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.NEXT_CACHE_DIR = process.env.NEXT_CACHE_DIR || path.join(__dirname, "tmp", "next-cache");
process.env.__NEXT_DISABLE_FS_CACHE = process.env.__NEXT_DISABLE_FS_CACHE || "1";
process.env.NEXT_DISABLE_HTTP_FILE_CACHE = process.env.NEXT_DISABLE_HTTP_FILE_CACHE || "1";

const tmpDir = path.join(__dirname, "tmp");
const logFile = path.join(tmpDir, "runtime.log");
for (const p of [tmpDir, process.env.NEXT_CACHE_DIR]) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] BOOT wrapper\n`); } catch {}

// prosty logger do tmp/runtime.log
const orig = { log: console.log, warn: console.warn, error: console.error };
const append = (tag, ...a) => { try {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${tag} ` +
    a.map(x => (x instanceof Error ? (x.stack || String(x)) : (typeof x === "object" ? JSON.stringify(x) : String(x)))).join(" ") + "\n");
} catch {} };
["log","warn","error"].forEach(k => { console[k] = (...a) => { append(k.toUpperCase(), ...a); try { orig[k](...a); } catch {} }; });
process.on("uncaughtException", e => append("UNCAUGHT", e));
process.on("unhandledRejection", r => append("UNHANDLED", r));

// shim: wyłącz TTY i zstubuj stdin (fix dla "open EEXIST" przy new Socket(stdin))
try {
  const tty = require("tty");
  if (tty && typeof tty.isatty === "function") { tty.isatty = () => false; append("INFO","tty.isatty -> false"); }
  const { Readable } = require("stream");
  const nullIn = new Readable({ read(){ this.push(null); } });
  Object.defineProperty(process, "stdin", { get(){ return nullIn; }, configurable: true });
  append("INFO","process.stdin stubbed");
} catch (e) { append("WARN","stdin shim failed", e); }

// uruchom prawdziwy serwer Next (standalone)
require("./.next/standalone/server.js");
