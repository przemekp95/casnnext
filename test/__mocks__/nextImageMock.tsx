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
  ...props
}: NextImageMockProps) {
  const {
    fill,
    priority,
    unoptimized,
    placeholder,
    blurDataURL,
    loader,
    quality,
    onLoadingComplete,
    ...imgProps
  } = props;
  const normalizedSrc = typeof src === 'string' ? src : src?.src ?? '';
  void fill;
  void priority;
  void unoptimized;
  void placeholder;
  void blurDataURL;
  void loader;
  void quality;
  void onLoadingComplete;

  return <img {...imgProps} src={normalizedSrc} alt={alt ?? ''} />;
}

type GetImagePropsInput = {
  src: string | { src?: string };
  alt?: string;
} & ImgHTMLAttributes<HTMLImageElement>;

export function getImageProps({ src, alt, ...props }: GetImagePropsInput) {
  const normalizedSrc = typeof src === 'string' ? src : src?.src ?? '';

  return {
    props: {
      ...props,
      alt: alt ?? '',
      src: normalizedSrc,
      srcSet: normalizedSrc,
    },
  };
}
