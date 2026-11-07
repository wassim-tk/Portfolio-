document.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement;

    // 1. Theme toggle (initial theme is set inline in <head> to avoid a flash)
    const themeBtn = document.getElementById('theme-toggle');
    const metaTheme = document.querySelector('meta[name="theme-color"]');

    const applyTheme = (theme) => {
        root.setAttribute('data-theme', theme);
        themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#0b0f0e' : '#f6f8f6');
    };

    applyTheme(root.getAttribute('data-theme') || 'dark');

    themeBtn.addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
    });

    // 2. Navbar background on scroll
    const navbar = document.querySelector('.navbar');
    const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // 3. Mobile menu
    const navLinks = document.getElementById('nav-links');
    const menuBtn = document.querySelector('.mobile-menu-btn');

    const setMenu = (open) => {
        navLinks.classList.toggle('active', open);
        navbar.classList.toggle('menu-open', open);
        menuBtn.setAttribute('aria-expanded', String(open));
        menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.style.overflow = open ? 'hidden' : '';
    };

    menuBtn.addEventListener('click', () => setMenu(!navLinks.classList.contains('active')));
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
            setMenu(false);
            menuBtn.focus();
        }
    });
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && navLinks.classList.contains('active')) setMenu(false);
    });

    // 4. Highlight the nav link of the section in view
    const links = [...document.querySelectorAll('.nav-link')];
    const sections = links.map(l => document.querySelector(l.getAttribute('href'))).filter(Boolean);

    if ('IntersectionObserver' in window) {
        const spy = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + entry.target.id));
                }
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        sections.forEach(s => spy.observe(s));

        // 5. Reveal on scroll
        const revealer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('appear');
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        document.querySelectorAll('.reveal').forEach((el, i) => {
            el.style.transitionDelay = (el.closest('.hero-section') ? i * 80 : 0) + 'ms';
            revealer.observe(el);
        });
    } else {
        document.querySelectorAll('.reveal').forEach(el => el.classList.add('appear'));
    }

    // 6. Project image galleries
    document.querySelectorAll('[data-gallery]').forEach(gallery => {
        const main = gallery.querySelector('.gallery-main');
        const caption = gallery.querySelector('.gallery-caption');
        const prefix = caption ? caption.textContent.split('·')[0] + '· ' : '';
        gallery.querySelectorAll('.thumb').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('active')) return;
                gallery.querySelectorAll('.thumb').forEach(t => {
                    t.classList.toggle('active', t === btn);
                    t.setAttribute('aria-pressed', String(t === btn));
                });
                main.classList.add('swapping');
                setTimeout(() => {
                    main.src = btn.dataset.src;
                    main.alt = btn.dataset.alt;
                    main.style.objectPosition = btn.dataset.pos || '50% 50%';
                    main.classList.toggle('contain', btn.dataset.fit === 'contain');
                    if (caption) caption.textContent = prefix + btn.dataset.caption;
                    main.classList.remove('swapping');
                }, 180);
            });
        });
    });

    // 7. Contact form (Formspree)
    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');

    if (contactForm) {
        const submitBtn = contactForm.querySelector('.submit-btn');
        const originalBtn = submitBtn.innerHTML;

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending…';
            formStatus.className = 'form-status';
            formStatus.textContent = '';

            const data = Object.fromEntries(new FormData(contactForm).entries());

            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    body: JSON.stringify(data),
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
                });
                const result = await response.json().catch(() => null);

                if (response.ok) {
                    formStatus.textContent = 'Thanks! Your message has been sent successfully.';
                    formStatus.classList.add('success');
                    contactForm.reset();
                } else {
                    if (result && result.errors) {
                        formStatus.textContent = result.errors.map(err => err.message).join(', ');
                    } else if (result && result.error) {
                        formStatus.textContent = result.error;
                    } else {
                        formStatus.textContent = 'Oops! There was a problem submitting your form.';
                    }
                    formStatus.classList.add('error');
                }
            } catch (error) {
                formStatus.textContent = 'Connection error. Please check your internet or try again later.';
                formStatus.classList.add('error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtn;
            }
        });
    }
});
