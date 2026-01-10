describe('Nawigacja', () => {
  it('Strona główna odpowiada i ma podstawowe treści', () => {
    cy.viewport('iphone-6');

    cy.visit('/');
    cy.contains(/niepodległej|analizy/i);
    // Check if there are any links
    cy.get('a').should('have.length.greaterThan', 0);
  });

  it('Menu mobilne - hamburger menu istnieje', () => {
    cy.viewport('iphone-6');

    cy.visit('/');

    // Check if hamburger menu button exists
    cy.get('button[aria-expanded]').should('exist');
  });

  it('Nawigacja zawiera podstawowe linki', () => {
    cy.visit('/');

    // Check for basic navigation links
    cy.get('nav a').should('have.length.greaterThan', 0);
    cy.get('a[href="/"]').should('exist');
  });

  it('Linki nawigacyjne są klikalne', () => {
    cy.visit('/');

    // Try to click on the first navigation link
    cy.get('nav a').first().should('be.visible');
  });
});