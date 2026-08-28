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
type SafeImageDimension = NonNullable<SafeImageProps['width']>;
type SafeImageDimensions = Pick<SafeImageProps, 'width' | 'height'> & { fallback: boolean };

function isSafeImageDimension(value: MdxImageProps['width']): value is SafeImageDimension {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0;
  }

  return typeof value === 'string' && /^\d+$/.test(value);
}

function toSafeImageDimensions(
  width: MdxImageProps['width'],
  height: MdxImageProps['height'],
): SafeImageDimensions {
  if (isSafeImageDimension(width) && isSafeImageDimension(height)) {
    return { width, height, fallback: false };
  }

  return { width: 0, height: 0, fallback: true };
}

function MdxImage({ src, alt, width, height, srcSet, style, ...rest }: MdxImageProps) {
  void srcSet;
  const { fallback, ...dimensions } = toSafeImageDimensions(width, height);

  return (
    <SafeImage
      {...rest}
      src={String(src ?? '')}
      alt={alt ?? ''}
      {...dimensions}
      style={fallback ? { ...style, width: 'auto', height: 'auto' } : style}
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
