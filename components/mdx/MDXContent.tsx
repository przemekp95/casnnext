/* eslint-disable @typescript-eslint/no-explicit-any */
// components/mdx/MDXContent.tsx
import { MDXRemote } from 'next-mdx-remote/rsc';
import SafeImage from '../SafeImage';
// Te dwa komponenty są Client Components (pliki zaczynają się od `use client`)
import Chart from '../charts/Chart';
import Map from '../maps/Map';

const components = {
  // MDX component props require any types due to dynamic nature
  img: (props: any) => <SafeImage {...props} />,
  Image: (props: any) => <SafeImage {...props} />,
  Chart: Chart as any,
  Map: Map as any,
  // Linki zostają jako zwykłe <a> w MDX
};

export default function MDXContent({ source }: { source: string }) {
  // Brak remark/rehype robiących fetch w runtime
  return <MDXRemote source={source} components={components} options={{ parseFrontmatter: false }} />;
}
