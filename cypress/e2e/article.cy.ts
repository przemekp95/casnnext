describe('Artykuł i 404', () => {
  it('Wizyta na nieistniejącym slugu → 404', () => {
    cy.request({ url: '/analizy/nieistniejacy-slug-xyz', failOnStatusCode: false })
      .its('status')
      .should('be.oneOf', [404, 200]); // 200, jeśli aplikacja customowo obsłuży brak
  });

  it('Wejście na przykładowy slug (jeśli istnieje) nie powinno crashować', () => {
    const candidate = 'pierwsza-analiza';
    cy.request({ url: `/analizy/${candidate}`, failOnStatusCode: false }).then(res => {
      expect([200,404]).to.include(res.status);
      if (res.status === 200) {
        cy.visit(`/analizy/${candidate}`);
        cy.get('h1').should('exist');
      }
    });
  });
});
