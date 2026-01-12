'use client';

import { useState, useEffect } from 'react';

type Props = {
  email: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
  iconClass?: string;
};

export function EmailLink({
  email,
  label = 'Email',
  ariaLabel,
  className = '',
  iconClass = 'mdi mdi-email mr-1 text-custom',
}: Props) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Don't render anything on the server to prevent Cloudflare obfuscation
  if (!isMounted) {
    return null;
  }

  return (
    <a
      href={`mailto:${email}`}
      aria-label={ariaLabel ?? `Wyślij email do ${email}`}
      className={className}
    >
      {iconClass && <i className={iconClass} aria-hidden="true"></i>}
      {label}: {email}
    </a>
  );
}