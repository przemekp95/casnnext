describe('Smoke', () => {
  it('Home ładuje się i zawiera słowa kluczowe', () => {
    cy.visit('/');
    cy.contains(/CASN|Centrum Analiz|Analizy/i);
  });

  it('Strona analizy istnieje albo daje 404', () => {
    const slug = 'pierwsza-analiza'; // podmień na realny slug
    cy.request({ url: `/analizy/${slug}`, failOnStatusCode: false })
      .its('status')
      .should('be.oneOf', [200, 404]);
  });
});
