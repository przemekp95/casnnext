describe('Smoke', () => {
  it('Home ładuje się i zawiera słowa kluczowe', () => {
    cy.request('/').then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.include('Centrum Analiz');
      expect(response.body).to.include('niepodległej');
    });
  });

  it('API health endpoint odpowiada', () => {
    cy.request('/api/health').its('status').should('eq', 200);
  });
});