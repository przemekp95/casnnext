// components/mdx/MDXContent.tsx
import { MDXRemote } from 'next-mdx-remote/rsc';
import { ComponentProps } from 'react';
import SafeImage from '../SafeImage';
// Te dwa komponenty są Client Components (pliki zaczynają się od `use client`)
import Chart from '../charts/Chart';
import Map from '../maps/Map';

const components = {
  img: (props: ComponentProps<typeof SafeImage>) => <SafeImage {...props} />,
  Image: (props: ComponentProps<typeof SafeImage>) => <SafeImage {...props} />,
  Chart: Chart,
  Map: Map,
  // Linki zostają jako zwykłe <a> w MDX
};

export default function MDXContent({ source }: { source: string }) {
  // Brak remark/rehype robiących fetch w runtime
  return <MDXRemote source={source} components={components} options={{ parseFrontmatter: false }} />;
}