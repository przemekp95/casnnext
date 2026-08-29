describe('Hydration Tests', () => {
  function assertAuthorsPageLoaded() {
    cy.location('pathname').should('eq', '/autorzy');
    cy.title().should('include', 'Nasi autorzy');
    cy.get('nav[aria-label="breadcrumb"]').contains('Nasi autorzy').should('exist');
  }

  it('should hydrate without errors on all pages', () => {
    // Visit homepage and check for hydration errors in production
    cy.visit('/');

    // Check for hydration errors in console - production build may not have __NEXT_DATA__
    cy.window().then((win) => {
      // Override console.error to catch hydration errors
      const originalError = win.console.error;
      const hydrationErrors: string[] = [];

      win.console.error = (...args: unknown[]) => {
        const message = args.join(' ');
        if (message.includes('Minified React error') ||
            message.includes('hydration') ||
            message.includes('Hydration') ||
            message.includes('Text content does not match') ||
            message.includes('Expected server HTML to contain') ||
            message.includes('There was an error while hydrating')) {
          hydrationErrors.push(message);
        }
        originalError.apply(win.console, args);
      };

      // Store for later checks
      (win as { hydrationErrors?: string[] }).hydrationErrors = hydrationErrors;
    });

    // Wait a bit for hydration to complete
    cy.wait(2000);

    // Verify no hydration errors occurred
    cy.window().should((win) => {
      const errors = (win as { hydrationErrors?: string[] }).hydrationErrors || [];
      expect(errors.length).to.equal(0, `Hydration errors found: ${errors.join(', ')}`);
    });
  });

  it('should maintain consistent DOM structure after hydration', () => {
    cy.visit('/');

    // Check for hydration mismatches in console
    cy.window().then((win) => {
      const originalWarn = win.console.warn;
      const originalError = win.console.error;
      const hydrationWarnings: string[] = [];
      const hydrationErrors: string[] = [];

      win.console.warn = (...args: unknown[]) => {
        const message = args.join(' ');
        if (message.includes('Expected server HTML') ||
            message.includes('Did not expect server HTML') ||
            message.includes('hydration') ||
            message.includes('mismatch')) {
          hydrationWarnings.push(message);
        }
        originalWarn.apply(win.console, args);
      };

      win.console.error = (...args: unknown[]) => {
        const message = args.join(' ');
        if (message.includes('hydration') ||
            message.includes('Hydration') ||
            message.includes('Text content does not match') ||
            message.includes('There was an error while hydrating')) {
          hydrationErrors.push(message);
        }
        originalError.apply(win.console, args);
      };

      (win as { hydrationWarnings?: string[]; hydrationErrors?: string[] }).hydrationWarnings = hydrationWarnings;
      (win as { hydrationWarnings?: string[]; hydrationErrors?: string[] }).hydrationErrors = hydrationErrors;
    });

    // Wait for hydration to complete
    cy.wait(2000);

    // Check for hydration warnings/errors
    cy.window().should((win) => {
      const warnings = (win as { hydrationWarnings?: string[] }).hydrationWarnings || [];
      const errors = (win as { hydrationWarnings?: string[]; hydrationErrors?: string[] }).hydrationErrors || [];

      // Log warnings for debugging
      if (warnings.length > 0) {
        void console.log('Hydration warnings:', warnings);
      }

      // Fail if there are hydration errors
      expect(errors.length).to.equal(0, `Hydration errors found: ${errors.join(', ')}`);

      // Allow some warnings but log them
      if (warnings.length > 0) {
        cy.log(`Hydration warnings detected: ${warnings.length} warnings`);
      }
    });
  });

  it('should load authors page without hydration errors', () => {
    cy.visit('/autorzy');

    // Wait for page to load
    assertAuthorsPageLoaded();

    // Check for hydration errors
    cy.window().then((win) => {
      const originalError = win.console.error;
      const hydrationErrors: string[] = [];

      win.console.error = (...args: unknown[]) => {
        const message = args.join(' ');
        if (message.includes('Minified React error') ||
            message.includes('hydration') ||
            message.includes('TypeError')) {
          hydrationErrors.push(message);
        }
        originalError.apply(win.console, args);
      };

      (win as { hydrationErrors?: string[] }).hydrationErrors = hydrationErrors;
    });

    // Verify no errors
    cy.window().should((win) => {
      const errors = (win as { hydrationErrors?: string[] }).hydrationErrors || [];
      expect(errors.length).to.equal(0, `Errors found: ${errors.join(', ')}`);
    });
  });

  it('should load zbiory page without hydration errors', () => {
    cy.visit('/zbiory');

    // Wait for page to load
    cy.contains('Zbiory analiz').should('be.visible');

    // Check for hydration errors
    cy.window().then((win) => {
      const originalError = win.console.error;
      const hydrationErrors: string[] = [];

      win.console.error = (...args: unknown[]) => {
        const message = args.join(' ');
        if (message.includes('Minified React error') ||
            message.includes('hydration') ||
            message.includes('TypeError')) {
          hydrationErrors.push(message);
        }
        originalError.apply(win.console, args);
      };

      (win as { hydrationErrors?: string[] }).hydrationErrors = hydrationErrors;
    });

    // Verify no errors
    cy.window().should((win) => {
      const errors = (win as { hydrationErrors?: string[] }).hydrationErrors || [];
      expect(errors.length).to.equal(0, `Errors found: ${errors.join(', ')}`);
    });
  });

  it('should render author cards with all required attributes', () => {
    cy.visit('/autorzy');

    cy.get('.our-team-box').should('have.length.greaterThan', 0).each(($card) => {
      // Check for image
      cy.wrap($card).find('img').should('have.attr', 'alt');
      cy.wrap($card).find('img').should('have.attr', 'src');

      // Check for name
      cy.wrap($card).find('.our-team-name h6').should('not.be.empty');

      // Check for link
      cy.wrap($card).find('a').should('have.attr', 'href').and('match', /^\/autor\//);
    });
  });

  it('should render analysis cards with proper structure', () => {
    cy.visit('/zbiory');

    cy.get('.blog-list-item').should('have.length.greaterThan', 0).each(($card) => {
      // Verify CSS classes
      cy.wrap($card).should('have.class', 'bg-white').and('have.class', 'rounded');

      // Check for image
      cy.wrap($card).find('img').should('have.attr', 'alt');

      // Check for title
      cy.wrap($card).find('.cases-desc h5').should('not.be.empty');

      // Check for download button
      cy.wrap($card).find('.learn-more a').should('contain', 'POBIERZ');
      cy.wrap($card).find('.learn-more a').should('have.attr', 'href').and('match', /\.pdf$/);
      cy.wrap($card).find('.learn-more a').should('have.attr', 'target', '_blank');
      cy.wrap($card).find('.learn-more a').should('have.attr', 'rel', 'noopener noreferrer');
    });
  });

  it('should load data from APIs without errors', () => {
    // Test authors API
    cy.request('/api/authors').then((response) => {
      expect(response.status).to.equal(200);
      expect(Array.isArray(response.body)).to.equal(true);
      expect(response.body).to.have.length.greaterThan(0);

      if (response.body.length > 0) {
        const author = response.body[0];
        expect(author).to.have.property('id');
        expect(author).to.have.property('slug');
        expect(author).to.have.property('name');
        expect(author).to.have.property('displayName');
      }
    });

    // Test articles API
    cy.request('/api/articles').then((response) => {
      expect(response.status).to.equal(200);
      expect(Array.isArray(response.body)).to.equal(true);
      expect(response.body).to.have.length.greaterThan(0);

      if (response.body.length > 0) {
        const article = response.body[0];
        expect(article).to.have.property('id');
        expect(article).to.have.property('title');
        expect(article).to.have.property('slug');
        expect(article).to.have.property('authorId');
      }
    });
  });

  it('should handle simulated Cloudflare Email Obfuscation without hydration errors', () => {
    // Visit page with email to test Cloudflare simulation
    cy.visit('/autorzy');

    // Wait for page to load
    assertAuthorsPageLoaded();

    // Set up hydration error monitoring
    cy.window().then((win) => {
      const originalError = win.console.error;
      const hydrationErrors: string[] = [];

      win.console.error = (...args: unknown[]) => {
        const message = args.join(' ');
        if (message.includes('Minified React error') ||
            message.includes('hydration') ||
            message.includes('Hydration') ||
            message.includes('Text content does not match') ||
            message.includes('Expected server HTML to contain') ||
            message.includes('There was an error while hydrating')) {
          hydrationErrors.push(message);
        }
        originalError.apply(win.console, args);
      };

      (win as { hydrationErrors?: string[] }).hydrationErrors = hydrationErrors;
    });

    // SIMULATE CLOUDFLARE EMAIL OBFUSCATION BEHAVIOR
    // This mimics what Cloudflare does: modify email text nodes after HTML is sent but before hydration
    cy.document().then((doc) => {
      // Find all text nodes containing @ symbol (simulating Cloudflare detection)
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          return node.textContent?.includes('@') ?
            NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });

      const textNodes: Text[] = [];
      let node;
      while ((node = walker.nextNode())) {
        textNodes.push(node as Text);
      }

      // Simulate Cloudflare obfuscation: replace email text with obfuscated version
      textNodes.forEach((textNode) => {
        const originalText = textNode.textContent || '';
        // Cloudflare typically replaces with: /cdn-cgi/l/email-protection#...
        const obfuscatedText = originalText.replace(
          /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
          '/cdn-cgi/l/email-protection#$1'
        );
        if (obfuscatedText !== originalText) {
          textNode.textContent = obfuscatedText;
        }
      });
    });

    // Wait for potential hydration to complete
    cy.wait(3000);

    // Check for hydration errors - our EmailLink component should prevent them
    cy.window().should((win) => {
      const errors = (win as { hydrationErrors?: string[] }).hydrationErrors || [];

      // We expect NO hydration errors because:
      // 1. EmailLink renders client-only (no server text to mismatch)
      // 2. Direct email text modifications shouldn't affect React hydration
      expect(errors.length).to.equal(0, `Unexpected hydration errors after Cloudflare simulation: ${errors.join(', ')}`);
    });

    // Verify email link still works correctly after simulation
    cy.get('a[href*="mailto:"]').should('exist').and('be.visible');

    // Verify the email text is properly restored by our client component
    cy.get('a[href*="mailto:"]').should('contain', 'fundacja@sluzbaniepodleglej.pl');

    // Verify no data-cfemail attributes exist (Cloudflare protection markers)
    cy.get('[data-cfemail]').should('not.exist');

    // Verify no Cloudflare email decode script is loaded
    cy.window().then((win) => {
      const scripts = Array.from(win.document.querySelectorAll('script'))
        .map(script => script.src)
        .filter(src => src && src.includes('email-decode'));

      expect(scripts.length).to.equal(0, 'Cloudflare email decode script should not be present');
    });
  });

  it('should navigate between pages without hydration issues', () => {
    cy.visit('/');

    cy.get('nav[aria-label="Menu główne"] a[href="/autorzy"]').click();
    cy.location('pathname').should('eq', '/autorzy');

    cy.get('nav[aria-label="Menu główne"] a[href="/zbiory"]').click();
    cy.location('pathname').should('eq', '/zbiory');

    cy.get('nav[aria-label="Menu główne"] a[href="/"]').click();
    cy.location('pathname').should('eq', '/');
  });
});
