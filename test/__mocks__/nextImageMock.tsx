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

function isValidDimension(value: unknown): value is number | `${number}` {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0;
  }

  return typeof value === 'string' && /^\d+$/.test(value);
}

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
  const hasUnsupportedFillDimensions =
    (imgProps.width !== undefined && imgProps.width !== 0) ||
    (imgProps.height !== undefined && imgProps.height !== 0);
  const hasUnsupportedFillStyles =
    (imgProps.style?.width !== undefined && imgProps.style.width !== '100%') ||
    (imgProps.style?.height !== undefined && imgProps.style.height !== '100%');

  if (fill && hasUnsupportedFillDimensions) {
    throw new Error('NextImageMock does not allow width or height when fill is true');
  }

  if (fill && hasUnsupportedFillStyles) {
    throw new Error('NextImageMock does not allow style.width or style.height when fill is true');
  }

  if (!fill && (!isValidDimension(imgProps.width) || !isValidDimension(imgProps.height))) {
    throw new Error('NextImageMock requires paired valid width and height unless fill is true');
  }

  void priority;
  void placeholder;
  void blurDataURL;
  void loader;
  void quality;
  void onLoadingComplete;

  return (
    <img
      {...imgProps}
      src={normalizedSrc}
      alt={alt ?? ''}
      data-next-image="true"
      data-next-image-unoptimized={String(unoptimized === true)}
    />
  );
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
