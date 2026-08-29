// components/mdx/MDXContent.tsx
import { MDXRemote } from 'next-mdx-remote/rsc';
import type { MDXComponents } from 'mdx/types.js';
import type { ComponentPropsWithoutRef } from 'react';
import SafeImage, { type SafeImageProps } from '../SafeImage';
// Te dwa komponenty są Client Components (pliki zaczynają się od `use client`)
import Chart from '../charts/Chart';
import Map from '../maps/Map';

type MdxImageProps = ComponentPropsWithoutRef<'img'> & { fill?: boolean };
type MdxHeadingProps = ComponentPropsWithoutRef<'h1'>;
type SafeImageDimensions = Pick<SafeImageProps, 'width' | 'height'>;

function toSafeImageDimension(value: MdxImageProps['width']): number | undefined {
  const normalized = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

  return typeof normalized === 'number' && Number.isFinite(normalized) && normalized >= 0
    ? normalized
    : undefined;
}

function toSafeImageDimensions(
  width: MdxImageProps['width'],
  height: MdxImageProps['height'],
): SafeImageDimensions | undefined {
  const normalizedWidth = toSafeImageDimension(width);
  const normalizedHeight = toSafeImageDimension(height);

  if (normalizedWidth !== undefined && normalizedHeight !== undefined) {
    return { width: normalizedWidth, height: normalizedHeight };
  }

  return undefined;
}

function MdxImage({ src, alt, width, height, srcSet, style, fill, ...rest }: MdxImageProps) {
  void srcSet;

  if (fill) {
    return <SafeImage {...rest} src={String(src ?? '')} alt={alt ?? ''} fill style={style} />;
  }

  const dimensions = toSafeImageDimensions(width, height);

  return (
    <SafeImage
      {...rest}
      src={String(src ?? '')}
      alt={alt ?? ''}
      {...(dimensions ?? { width: 0, height: 0 })}
      style={dimensions ? style : { width: 'auto', height: 'auto', ...style }}
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
