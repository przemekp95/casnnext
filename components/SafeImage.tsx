import Image from 'next/image';
import type React from 'react';

export type SafeImageProps = Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'> & {
  src: string;
  alt: string;
};

/**
 * Prosty <img> komponent bez klientowej logiki.
 * Renderuje się identycznie na serwerze i kliencie.
 */
export default function SafeImage({
  src = '',
  alt = '',
  ...rest
}: SafeImageProps) {
  return <Image src={String(src)} alt={alt} {...rest} unoptimized={true} />;
}
