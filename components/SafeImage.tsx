'use client';

import { useEffect, useState } from 'react';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  timeoutMs?: number;
};

/**
 * Prosty <img> z klientowym fallbackiem (bez Sharp/libvips).
 * Nie używa next/image. Dobre na shared-hostingu.
 */
export default function SafeImage({
  src = '',
  alt = '',
  timeoutMs = 7000,
  ...rest
}: Props) {
  const [ok, setOk] = useState(true);

  useEffect(() => {
    let alive = true;
    const img = new Image();
    const timer = setTimeout(() => alive && setOk(false), timeoutMs);

    img.onload = () => { if (alive) { clearTimeout(timer); setOk(true); } };
    img.onerror = () => { if (alive) { clearTimeout(timer); setOk(false); } };
    img.src = String(src);

    return () => { alive = false; clearTimeout(timer); };
  }, [src, timeoutMs]);

  if (!ok) {
    return (
      <div className="bg-gray-100 text-gray-500 text-sm p-3 rounded">
        Obraz niedostępny
      </div>
    );
  }

   
  return <img src={String(src)} alt={alt} {...rest} />;
}
