import { prisma } from "@/lib/prisma";
export const revalidate = 60;

export default async function Analizy() {
  const posts = await prisma.article.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" as const },
  });

  return (
    <div className="container py-4">
      <h1 className="h3 mb-3">Analizy</h1>
      <div className="row g-3">
        {posts.map((p) => (
          <div key={p.id} className="col-md-6 col-lg-4">
            <a className="card h-100 text-decoration-none" href={`/analizy/${p.slug}`}>
              <div className="card-body">
                <h2 className="h5 mb-2">{p.title}</h2>
                <p className="text-muted">{p.excerpt}</p>
              </div>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
