describe('Artykuł i 404', () => {
  it('Wizyta na nieistniejącym slugu → 404', () => {
    cy.request({ url: '/analizy/nieistniejacy-slug-xyz', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
  });

  it('Wejście na istniejący artykuł powinno zwrócić 200', () => {
    // Use a slug that exists in the database
    const existingSlug = 'wot-balcerowski';
    cy.request({ url: `/analizy/${existingSlug}`, failOnStatusCode: false })
      .its('status')
      .should('eq', 200);
  });
});