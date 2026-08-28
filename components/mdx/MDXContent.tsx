// components/mdx/MDXContent.tsx
import { MDXRemote } from 'next-mdx-remote/rsc';
import type { MDXComponents } from 'mdx/types.js';
import type { ComponentPropsWithoutRef } from 'react';
import SafeImage, { type SafeImageProps } from '../SafeImage';
// Te dwa komponenty są Client Components (pliki zaczynają się od `use client`)
import Chart from '../charts/Chart';
import Map from '../maps/Map';

type MdxImageProps = ComponentPropsWithoutRef<'img'>;
type MdxHeadingProps = ComponentPropsWithoutRef<'h1'>;
type SafeImageDimension = SafeImageProps['width'];

function toSafeImageDimension(value: MdxImageProps['width']): SafeImageDimension {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return value as `${number}`;
  }

  return undefined;
}

function MdxImage({ src, alt, width, height, srcSet, ...rest }: MdxImageProps) {
  void srcSet;

  return (
    <SafeImage
      {...rest}
      src={String(src ?? '')}
      alt={alt ?? ''}
      width={toSafeImageDimension(width)}
      height={toSafeImageDimension(height)}
    />
  );
}

function MdxHeading(props: MdxHeadingProps) {
  return <h2 {...props} />;
}

const components: MDXComponents = {
  img: MdxImage,
  Image: MdxImage,
  // Article pages already render the main H1 in Hero; demote in-content H1s.
  h1: MdxHeading,
  Chart,
  Map,
  // Linki zostają jako zwykłe <a> w MDX
};

export default function MDXContent({ source }: { source: string }) {
  // Brak remark/rehype robiących fetch w runtime
  return <MDXRemote source={source} components={components} options={{ parseFrontmatter: false }} />;
}
