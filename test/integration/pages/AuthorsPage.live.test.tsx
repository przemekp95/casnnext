import { render, screen, within } from '@testing-library/react';
import AuthorsPage from '@/app/autorzy/page';

describe('Authors Page', () => {
  it('renders hero heading and breadcrumb', async () => {
    render(await AuthorsPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Nasi autorzy' })).toBeInTheDocument();

    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(breadcrumb).getByRole('link', { name: 'Strona główna' })).toHaveAttribute('href', '/');
    expect(within(breadcrumb).getByText('Nasi autorzy')).toBeInTheDocument();
  });

  it('renders either authors grid or empty state', async () => {
    const { container } = render(await AuthorsPage());

    const cards = container.querySelectorAll('.our-team-box');

    if (cards.length === 0) {
      expect(screen.getByText('Autorzy będą wkrótce dodani.')).toBeInTheDocument();
    } else {
      expect(cards.length).toBeGreaterThan(0);
      expect(container.querySelector('.col-lg-3')).toBeInTheDocument();
      expect(container.querySelector('.team-img')).toBeInTheDocument();
    }
  });

  it('renders author links and avatars when author cards are present', async () => {
    const { container } = render(await AuthorsPage());

    const cards = Array.from(container.querySelectorAll('.our-team-box'));

    if (cards.length === 0) {
      expect(screen.getByText('Autorzy będą wkrótce dodani.')).toBeInTheDocument();
    } else {
      cards.forEach((card) => {
        const profileLink = card.querySelector('.our-team-overlay a[href^="/autor/"]');
        const avatar = card.querySelector('.team-img img');

        expect(profileLink).toBeTruthy();
        expect(avatar).toBeTruthy();
        expect(avatar?.getAttribute('alt')).toBeTruthy();
        expect(avatar?.getAttribute('src')).toBeTruthy();
      });
    }
  });

  it('renders expected overlay structure for author cards', async () => {
    const { container } = render(await AuthorsPage());

    const cards = container.querySelectorAll('.our-team-box');

    if (cards.length === 0) {
      expect(screen.getByText('Autorzy będą wkrótce dodani.')).toBeInTheDocument();
    } else {
      expect(container.querySelector('.our-team-overlay')).toBeInTheDocument();
      expect(container.querySelector('.our-team-name')).toBeInTheDocument();
    }
  });
});
