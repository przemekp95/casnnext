describe('Smoke', () => {
  it('Home ładuje się i zawiera słowa kluczowe', () => {
    cy.request('/').then((response) => {
      expect(response.status).to.eq(200);

      // Check for essential content - be more flexible with exact wording
      const body = response.body.toLowerCase();
      expect(body).to.include('centrum'); // Should contain "Centrum"
      expect(body).to.include('analiz'); // Should contain "Analiz"
      expect(body).to.include('służby'); // Should contain "Służby"
    });
  });

  it('API health endpoint odpowiada', () => {
    cy.request('/api/health').its('status').should('eq', 200);
  });
});