import("./dist/runtime/server.js").catch((error) => {
  console.error("Failed to load compiled runtime:", error);
  process.exitCode = 1;
});
