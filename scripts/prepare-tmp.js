// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
const tmp = path.join(__dirname, "..", "tmp");
const ncache = path.join(tmp, "next-cache");
for (const p of [tmp, ncache]) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }