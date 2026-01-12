import Script from "next/script";

export default function LegacyScripts() {
  return (
    <>
      {/* Legacy scripts */}
      <Script src="/js/legacy/bootstrap.js" strategy="beforeInteractive" />
      <Script src="/js/legacy/app.js" strategy="beforeInteractive" />

      {/* Custom mobile menu code */}
      <Script id="mobile-menu" dangerouslySetInnerHTML={{
        __html: `
          // Mobile menu toggle functionality
          document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM loaded, initializing mobile menu...');

            const navbarToggle = document.querySelector('.navbar-toggle');
            const lines = document.querySelector('.navbar-toggle .lines');
            const navigation = document.querySelector('#navigation');

            console.log('Elements found:', { navbarToggle: !!navbarToggle, lines: !!lines, navigation: !!navigation });

            if (navbarToggle && lines && navigation) {
              console.log('Setting up event listeners...');

              navbarToggle.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Hamburger menu clicked!');

                const isExpanded = navbarToggle.getAttribute('aria-expanded') === 'true';

                // Toggle hamburger animation
                lines.classList.toggle('open');
                console.log('Lines class toggled:', lines.classList.contains('open'));

                // Update ARIA expanded state
                navbarToggle.setAttribute('aria-expanded', (!isExpanded).toString());

                // Toggle navigation visibility
                if (navigation.style.display === 'block') {
                  navigation.style.display = 'none';
                  navigation.classList.remove('open');
                  console.log('Menu hidden');
                } else {
                  navigation.style.display = 'block';
                  navigation.classList.add('open');
                  console.log('Menu shown');
                }
              });

              function closeMenu() {
                lines.classList.remove('open');
                navigation.style.display = 'none';
                navigation.classList.remove('open');
                navbarToggle.setAttribute('aria-expanded', 'false');
              }

              // Close menu when clicking on a link (mobile)
              const navLinks = navigation.querySelectorAll('a');
              console.log('Found navigation links:', navLinks.length);

              navLinks.forEach((link, index) => {
                link.addEventListener('click', function() {
                  console.log('Link clicked:', index);
                  if (window.innerWidth <= 991) {
                    closeMenu();
                    console.log('Menu closed after link click');
                  }
                });
              });

              // Close menu when clicking outside (mobile)
              document.addEventListener('click', function(event) {
                if (window.innerWidth <= 991 &&
                    !navbarToggle.contains(event.target) &&
                    !navigation.contains(event.target)) {
                  closeMenu();
                  console.log('Menu closed after clicking outside');
                }
              });

              // Handle window resize
              window.addEventListener('resize', function() {
                if (window.innerWidth > 991) {
                  closeMenu();
                  console.log('Window resized to desktop, menu reset');
                }
              });

              console.log('Mobile menu initialized successfully');
            } else {
              console.error('Could not find required elements for mobile menu');
            }
          });
        `
      }} />
    </>
  );
}