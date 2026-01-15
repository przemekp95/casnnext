describe('UI – elementy wspólne', () => {
  it('Header istnieje', () => {
    cy.visit('/');
    cy.get('#topnav').should('exist');
    cy.get('.navbar-toggle').should('exist');
  });

  it('Przycisk wyszukiwania jest widoczny', () => {
    cy.visit('/');
    cy.get('.search-toggle').should('be.visible');
    cy.get('.search-toggle svg').should('exist');
  });

  it('Strona ma podstawowe elementy', () => {
    cy.visit('/');
    cy.get('main').should('exist');
    cy.get('section.bg-footer').should('exist');
    cy.contains('niepodległość').should('exist');
  });
});