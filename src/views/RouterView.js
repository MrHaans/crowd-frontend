// ============================================================
//  RouterView.js — Page Transitions & Nav Active States
//  Cronos Warden — Cronos Edition
// ============================================================

export class RouterView {
  constructor() {
    this._pages   = ['home', 'docs', 'story', 'status'];
    this._navLinks = document.querySelectorAll('.nav-link[data-page]');
    this._mobileLinks = document.querySelectorAll('.mobile-nav-link[data-page]');
    this._hamburger = document.getElementById('hamburger-btn');
    this._mobileMenu = document.getElementById('mobile-menu');
  }

  // ── Show a page, hide others ─────────────────────────────
  showPage(page) {
    this._pages.forEach(p => {
      const el = document.getElementById('page-' + p);
      if (el) el.classList.toggle('active', p === page);
    });

    // Update active nav link
    this._navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    // Update active mobile nav link
    this._mobileLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    // Close mobile menu on navigation
    this.closeMobileMenu();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Bind nav link clicks ──────────────────────────────────
  bindNavLinks(callback) {
    this._navLinks.forEach(link => {
      link.addEventListener('click', () => callback(link.dataset.page));
    });

    // Mobile nav links
    this._mobileLinks.forEach(link => {
      link.addEventListener('click', () => callback(link.dataset.page));
    });

    // Logo → home
    const logo = document.querySelector('.nav-logo');
    if (logo) logo.addEventListener('click', () => callback('home'));

    // Hamburger toggle
    if (this._hamburger) {
      this._hamburger.addEventListener('click', () => this.toggleMobileMenu());
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (
        this._mobileMenu &&
        this._mobileMenu.classList.contains('open') &&
        !this._mobileMenu.contains(e.target) &&
        !this._hamburger.contains(e.target)
      ) {
        this.closeMobileMenu();
      }
    });
  }

  // ── Bind footer nav links ─────────────────────────────────
  bindFooterLinks(callback) {
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', () => callback(el.dataset.nav));
    });
  }

  // ── Mobile menu helpers ───────────────────────────────────
  toggleMobileMenu() {
    const isOpen = this._mobileMenu.classList.toggle('open');
    this._hamburger.classList.toggle('open', isOpen);
    this._hamburger.setAttribute('aria-expanded', isOpen);
  }

  closeMobileMenu() {
    if (this._mobileMenu) this._mobileMenu.classList.remove('open');
    if (this._hamburger) {
      this._hamburger.classList.remove('open');
      this._hamburger.setAttribute('aria-expanded', 'false');
    }
  }
}
