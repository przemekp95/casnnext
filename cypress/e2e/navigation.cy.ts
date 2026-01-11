describe('Nawigacja', () => {
  it('Strona główna odpowiada i ma podstawowe treści', () => {
    cy.viewport('iphone-6');

    cy.request({ url: '/', failOnStatusCode: false }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.be.a('string');
      expect(response.body).to.include('Centrum Analiz');
    });
  });

  it('Menu mobilne - hamburger menu istnieje', () => {
    cy.viewport('iphone-6');

    cy.request('/').then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.include('navbar-toggle');
    });
  });

  it('Nawigacja zawiera podstawowe linki', () => {
    cy.request('/').then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.include('Strona główna');
      expect(response.body).to.include('Autorzy');
    });
  });

  it('Linki nawigacyjne są klikalne', () => {
    cy.visit('/');
    cy.get('a[href="/"]').should('be.visible');
    cy.get('a[href="/autorzy"]').should('be.visible');
  });
});