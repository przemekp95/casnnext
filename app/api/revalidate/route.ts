import { revalidateTag } from 'next/cache';

export async function POST(req: Request) {
  const { tag } = await req.json().catch(() => ({}));
  if (!tag) return Response.json({ ok: false, error: 'Missing tag' }, { status: 400 });
  revalidateTag(tag, 'next');
  return Response.json({ ok: true });
}
