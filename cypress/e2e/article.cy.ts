describe('Artykuł i 404', () => {
  it('Nieistniejący slug zwraca HTTP 404', () => {
    cy.request({
      url: '/analizy/nieistniejacy-slug-xyz',
      failOnStatusCode: false,
    })
      .its('status')
      .should('eq', 404);
  });

  it('Nieistniejący slug renderuje stronę 404', () => {
    cy.visit('/analizy/nieistniejacy-slug-xyz');
    cy.contains('404').should('exist');
  });

  it('Istniejący artykuł zwraca HTTP 200', () => {
    // Use a slug that exists in the database
    const existingSlug = 'wot-balcerowski';
    cy.request(`/analizy/${existingSlug}`).its('status').should('eq', 200);
  });
});