import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getAuthorBySlug = cache(async (slug: string) => {
  return prisma.author.findUnique({
    where: { slug },
    include: {
      analyses: { select: { id: true, title: true, slug: true } },
    },
  });
});

export const getAllAuthorSlugs = cache(async () => {
  const rows = await prisma.author.findMany({ select: { slug: true } });
  return rows.map((r) => r.slug);
});
