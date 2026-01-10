describe('UI – elementy wspólne', () => {
  it('Header istnieje', () => {
    cy.visit('/', { failOnStatusCode: false });
    cy.get('header').should('exist');
  });

  it('Strona ma podstawowe elementy', () => {
    cy.visit('/', { failOnStatusCode: false });
    cy.get('body').should('exist');
    cy.get('main').should('exist');
  });
});