import { waitFor, within } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmailLink } from '@/components/EmailLink';

describe('EmailLink', () => {
  it('keeps the email address out of server static markup', () => {
    const markup = renderToStaticMarkup(<EmailLink email="fundacja@sluzbaniepodleglej.pl" />);

    expect(markup).toBe('');
  });

  it('renders the mailto link after hydrating the empty server markup', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(<EmailLink email="fundacja@sluzbaniepodleglej.pl" />);
    let root: Root | undefined;

    try {
      root = hydrateRoot(container, <EmailLink email="fundacja@sluzbaniepodleglej.pl" />);

      await waitFor(() => {
        expect(
          within(container).getByRole('link', { name: 'Wyślij email do fundacja@sluzbaniepodleglej.pl' }),
        ).toHaveAttribute('href', 'mailto:fundacja@sluzbaniepodleglej.pl');
      });
    } finally {
      act(() => {
        root?.unmount();
      });
    }
  });
});
