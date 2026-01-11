describe('UI – elementy wspólne', () => {
  it('Header istnieje', () => {
    cy.visit('/');
    cy.get('#topnav').should('exist');
    cy.get('.navbar-toggle').should('exist');
  });

  it('Strona ma podstawowe elementy', () => {
    cy.visit('/');
    cy.get('main').should('exist');
    cy.get('section.bg-footer').should('exist');
    cy.get('h1').should('contain', 'Centrum Analiz');
  });
});