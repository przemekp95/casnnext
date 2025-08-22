// server.js
const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3000;   // panel CF ustawi własny PORT w env
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, "0.0.0.0", () => {
    console.log(`> Ready on http://0.0.0.0:${port}`);
  });
});
