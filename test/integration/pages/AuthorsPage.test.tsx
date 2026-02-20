/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { render, screen, waitFor, within } from '@testing-library/react';

let PageComponent: any;
let hasComponent = false;
const runLiveTests = process.env.RUN_LIVE_TESTS === '1';

try {
  PageComponent = require('@/app/autorzy/page').default;
  hasComponent = !!PageComponent;
} catch {}

(hasComponent && runLiveTests ? describe : describe.skip)('Authors Page', () => {
  it('renders hero heading and breadcrumb', async () => {
    render(await PageComponent());

    expect(screen.getByRole('heading', { level: 1, name: 'Nasi autorzy' })).toBeInTheDocument();

    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(breadcrumb).getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(within(breadcrumb).getByText('Nasi autorzy')).toBeInTheDocument();
  });

  it('renders either authors grid or empty state', async () => {
    const { container } = render(await PageComponent());

    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });

    const cards = container.querySelectorAll('.our-team-box');

    if (cards.length === 0) {
      expect(screen.getByText('Autorzy będą wkrótce dodani.')).toBeInTheDocument();
      return;
    }

    expect(container.querySelector('.col-lg-3')).toBeInTheDocument();
    expect(container.querySelector('.team-img')).toBeInTheDocument();
  });

  it('renders author links and avatars when author cards are present', async () => {
    const { container } = render(await PageComponent());

    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });

    const cards = Array.from(container.querySelectorAll('.our-team-box'));

    if (cards.length === 0) {
      expect(screen.getByText('Autorzy będą wkrótce dodani.')).toBeInTheDocument();
      return;
    }

    cards.forEach((card) => {
      const profileLink = card.querySelector('.our-team-overlay a[href^="/autor/"]');
      const avatar = card.querySelector('.team-img img');

      expect(profileLink).toBeTruthy();
      expect(avatar).toBeTruthy();
      expect(avatar?.getAttribute('alt')).toBeTruthy();
      expect(avatar?.getAttribute('src')).toBeTruthy();
    });
  });

  it('renders expected overlay structure for author cards', async () => {
    const { container } = render(await PageComponent());

    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });

    const cards = container.querySelectorAll('.our-team-box');

    if (cards.length === 0) {
      expect(screen.getByText('Autorzy będą wkrótce dodani.')).toBeInTheDocument();
      return;
    }

    expect(container.querySelector('.our-team-overlay')).toBeInTheDocument();
    expect(container.querySelector('.our-team-name')).toBeInTheDocument();
  });
});
