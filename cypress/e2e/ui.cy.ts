describe('UI – elementy wspólne', () => {
  it('Header i ewentualny toggle menu (jeśli istnieje)', () => {
    cy.visit('/');
    cy.get('body').then(($b) => {
      const header = $b.find('header, [role="banner"]');
      if (header.length) {
        const btn = header.find('button, [data-testid="menu-toggle"]');
        if (btn.length) cy.wrap(btn[0]).click();
      }
    });
  });

  it('Stopka: jeśli jest, ma linki', () => {
    cy.visit('/');
    cy.get('body').then(($b) => {
      const f = $b.find('footer');
      if (!f.length) return; // brak stopki → nie failuj
      const links = f.find('a');
      expect(links.length).to.be.greaterThan(0);
    });
  });
});
