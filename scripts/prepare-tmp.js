const fs = require("fs");
const path = require("path");
const tmp = path.join(__dirname, "..", "tmp");
const ncache = path.join(tmp, "next-cache");
for (const p of [tmp, ncache]) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
