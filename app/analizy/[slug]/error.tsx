'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <div className="mx-auto max-w-prose p-6">
      <h2>Coś poszło nie tak przy renderowaniu artykułu.</h2>
      <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">{error.message}</pre>
      <button onClick={() => reset()} className="mt-4 px-3 py-2 rounded bg-black text-white">Spróbuj ponownie</button>
    </div>
  );
}
