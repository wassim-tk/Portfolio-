document.addEventListener('DOMContentLoaded', () => {
    // 1. Theme Toggling Logic
    const themeBtn = document.getElementById('theme-toggle');
    const moonIcon = document.getElementById('moon-icon');
    const sunIcon = document.getElementById('sun-icon');
    
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Set initial theme
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.replace('light-mode', 'dark-mode');
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
        moonIcon.style.display = 'none';
        sunIcon.style.display = 'block';
    } else {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
    }

    themeBtn.addEventListener('click', () => {
        const isDark = document.body.classList.contains('dark-mode');
        
        if (isDark) {
            document.body.classList.replace('dark-mode', 'light-mode');
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.replace('light-mode', 'dark-mode');
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
            localStorage.setItem('theme', 'dark');
        }
    });

    // 2. Navbar Scrolling Effect
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 3. Smooth Scrolling for Navigation Links & Close Mobile Menu
    const navLinks = document.querySelector('.nav-links');
    const mobileBtn = document.querySelector('.mobile-menu-btn');

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                // Close mobile menu if open
                if (navLinks.classList.contains('active')) {
                    navLinks.classList.remove('active');
                    // Reset hamburger icon
                    const spans = mobileBtn.querySelectorAll('span');
                    spans[0].style.transform = 'none';
                    spans[1].style.opacity = '1';
                    spans[2].style.transform = 'none';
                }

                // Scroll to target
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // 4. Scroll Animations (Intersection Observer)
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('appear');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.fade-in, .slide-up');
    animatedElements.forEach(el => {
        // Optimization: don't animate if already in viewport on load
        const rect = el.getBoundingClientRect();
        if(rect.top < window.innerHeight) {
            el.classList.add('appear');
        } else {
            observer.observe(el);
        }
    });

    // 5. Mobile Menu Toggle with Icon Animation
    mobileBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        
        const spans = mobileBtn.querySelectorAll('span');
        const isActive = navLinks.classList.contains('active');
        
        if (isActive) {
            spans[0].style.transform = 'translateY(8px) rotate(45deg)';
            spans[1].style.opacity = '0';
            spans[2].style.transform = 'translateY(-8px) rotate(-45deg)';
        } else {
            spans[0].style.transform = 'none';
            spans[1].style.opacity = '1';
            spans[2].style.transform = 'none';
        }
    });

    // 6. Contact Form Submission
    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');

    if (contactForm) {
        const submitBtn = contactForm.querySelector('.submit-btn');

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Basic UI feedback
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Sending...';
            formStatus.style.display = 'none';
            formStatus.className = 'form-status';

            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());
            
            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    body: JSON.stringify(data),
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });

                const result = await response.json();
                
                if (response.ok) {
                    formStatus.textContent = 'Thanks! Your message has been sent successfully.';
                    formStatus.classList.add('success');
                    contactForm.reset();
                } else {
                    if (result && result.errors) {
                        formStatus.textContent = result.errors.map(error => error.message).join(', ');
                    } else if (result && result.error) {
                        formStatus.textContent = result.error;
                    } else {
                        formStatus.textContent = 'Oops! There was a problem submitting your form.';
                    }
                    formStatus.classList.add('error');
                    console.error('Formspree error details:', result);
                }
            } catch (error) {
                console.error('Submission error:', error);
                formStatus.textContent = 'Connection error. Please check your internet or try again later.';
                formStatus.classList.add('error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Send Message';
                formStatus.style.display = 'block';
            }
        });
    }
});
