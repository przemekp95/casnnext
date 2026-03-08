import type { ImgHTMLAttributes } from 'react';

type NextImageMockProps = ImgHTMLAttributes<HTMLImageElement> & {
  src?: string | { src?: string };
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  loader?: unknown;
  quality?: number;
  onLoadingComplete?: (img: HTMLImageElement) => void;
};

export default function NextImageMock({
  src,
  alt,
  fill: _fill,
  priority: _priority,
  unoptimized: _unoptimized,
  placeholder: _placeholder,
  blurDataURL: _blurDataURL,
  loader: _loader,
  quality: _quality,
  onLoadingComplete: _onLoadingComplete,
  ...props
}: NextImageMockProps) {
  const normalizedSrc = typeof src === 'string' ? src : src?.src ?? '';

  return <img {...props} src={normalizedSrc} alt={alt ?? ''} />;
}
