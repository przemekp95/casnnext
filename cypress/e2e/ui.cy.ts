describe('UI – elementy wspólne', () => {
  it('Header istnieje', () => {
    cy.visit('/');
    cy.get('header').should('exist');
  });

  it('Strona ma podstawowe elementy', () => {
    cy.visit('/');
    cy.get('body').should('exist');
    cy.get('main').should('exist');
  });
});