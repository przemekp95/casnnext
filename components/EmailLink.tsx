'use client';

import { useSyncExternalStore } from 'react';

type Props = {
  email: string;
  ariaLabel?: string;
  className?: string;
  iconClass?: string;
};

export function EmailLink({
  email,
  ariaLabel,
  className = '',
  iconClass = 'mdi mdi-email mr-1 text-custom',
}: Props) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  // Don't render anything on the server to prevent Cloudflare obfuscation
  if (!mounted) {
    return null;
  }

  return (
    <a
      href={`mailto:${email}`}
      aria-label={ariaLabel ?? `Wyślij email do ${email}`}
      className={`${className} d-flex align-items-center`}
      style={{ whiteSpace: 'nowrap' }}
    >
      {iconClass && <i className={iconClass} aria-hidden="true" style={{ marginRight: '4px' }}></i>}
      <span style={{ fontSize: '13px' }}>{email}</span>
    </a>
  );
}
