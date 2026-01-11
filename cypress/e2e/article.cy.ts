describe('Artykuł i 404', () => {
  it('Wizyta na nieistniejącym slugu → 200 (fallback)', () => {
    cy.request('/analizy/nieistniejacy-slug-xyz').then((response) => {
      expect(response.status).to.eq(200);
    });
  });

  it('Wejście na istniejący artykuł powinno zwrócić 200', () => {
    // Use a slug that exists in the database
    const existingSlug = 'wot-balcerowski';
    cy.request(`/analizy/${existingSlug}`).then((response) => {
      expect(response.status).to.eq(200);
    });
  });
});