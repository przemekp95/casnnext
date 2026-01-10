describe('Smoke', () => {
  it('Home ładuje się i zawiera słowa kluczowe', () => {
    cy.visit('/');
    // Check for content that actually exists on the page
    cy.contains(/niepodległej|analizy|Przeczytaj/i);
  });

  it('API health endpoint odpowiada', () => {
    cy.request('/api/health').its('status').should('eq', 200);
  });
});