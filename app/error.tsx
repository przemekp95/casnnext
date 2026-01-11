"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Don't show error boundary for Next.js routing errors (like notFound)
  if (error?.digest === 'NEXT_NOT_FOUND' || error?.message?.includes('notFound')) {
    return null;
  }

  return (
    <html>
      <body>
        <div style={{ padding: "20px", fontFamily: "monospace" }}>
          <h1>Application Error</h1>
          <h2>{error.name}</h2>
          <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>
            {error.message}
          </pre>
          {error.stack && (
            <details>
              <summary>Stack Trace</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>
                {error.stack}
              </pre>
            </details>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}