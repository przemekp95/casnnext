describe('Artykuł i 404', () => {
  it('Nieistniejący slug renderuje stronę 404', () => {
    cy.visit('/analizy/nieistniejacy-slug-xyz', { failOnStatusCode: false });
    cy.title().should('include', 'Nie znaleziono artykułu');
    cy.get('template[data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"]').should('exist');
  });

  it('Istniejący artykuł zwraca HTTP 200', () => {
    // Use a slug that exists in the database
    const existingSlug = 'wot-balcerowski';
    cy.request(`/analizy/${existingSlug}`).its('status').should('eq', 200);
  });

  it('API: nieistniejący artykuł zwraca HTTP 404', () => {
    cy.request({
      url: '/api/articles/nieistniejacy-slug-xyz',
      failOnStatusCode: false,
    })
      .its('status')
      .should('eq', 404);
  });
});
