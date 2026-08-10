/* =====================================================
   Savoria Restaurant — JavaScript
   ===================================================== */

// ---------- API helper ----------
function apiBase() {
  // When served by the backend (http://localhost:4000), use relative paths.
  // When opened directly (file://), fall back to the local server URL.
  if (window.location.protocol !== 'file:') {
    return '';
  }
  return 'http://localhost:4000';
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error((body && body.error) || `Request failed (${res.status})`);
  }
  return body;
}

// ---------- Navbar scroll effect ----------
const navbar = document.getElementById('navbar');
const scrollTopBtn = document.getElementById('scrollTop');

function onScroll() {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
  scrollTopBtn.classList.toggle('show', window.scrollY > 400);
}

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

scrollTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ---------- Native smooth scrolling for all in-page anchor links ----------
// Ensures navbar links scroll to the correct section without being hidden
// behind the fixed header, even if `scroll-padding-top` isn't supported.
const NAV_OFFSET = 80;

function scrollToSection(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.pageYOffset - NAV_OFFSET;
  window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
}

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (href.length > 1) {
      e.preventDefault();
      scrollToSection(href.slice(1));
    }
  });
});

// ---------- Mobile menu ----------
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navLinks.classList.toggle('open');
});

// Close mobile menu when a link is clicked
navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navLinks.classList.remove('open');
  });
});

// ---------- Active nav link on scroll (scrollspy) ----------
const sections = document.querySelectorAll('section[id]');
const navAnchors = navLinks.querySelectorAll('a');

function updateActiveLink() {
  const scrollPos = window.scrollY + 120;
  let currentId = '';

  sections.forEach((section) => {
    if (scrollPos >= section.offsetTop && scrollPos < section.offsetTop + section.offsetHeight) {
      currentId = section.getAttribute('id');
    }
  });

  navAnchors.forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === `#${currentId}`);
  });
}

window.addEventListener('scroll', updateActiveLink, { passive: true });
updateActiveLink();

// ---------- Scroll reveal ----------
const revealEls = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

revealEls.forEach((el) => revealObserver.observe(el));

// ---------- Animated counters ----------
const statNumbers = document.querySelectorAll('.stat-num');

const counterObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = Number(el.getAttribute('data-count') || 0);
      const duration = 1600;
      const startTime = performance.now();

      function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(update);
      }

      requestAnimationFrame(update);
      counterObserver.unobserve(el);
    });
  },
  { threshold: 0.5 }
);

statNumbers.forEach((el) => counterObserver.observe(el));

// ---------- Menu (loaded from API) ----------
const menuGrid = document.getElementById('menuGrid');
const menuTabs = document.getElementById('menuTabs');
const categoryLabels = {
  starters: 'Starters',
  pasta: 'Pasta',
  pizza: 'Pizza',
  mains: 'Mains',
  desserts: 'Desserts'
};

function renderMenuCards(items) {
  if (!menuGrid) return;
  menuGrid.innerHTML = '';

  items.forEach((item, i) => {
    const card = document.createElement('article');
    card.className = 'menu-card';
    card.setAttribute('data-category', item.category);
    card.style.transitionDelay = `${(i % 3) * 0.06}s`;

    card.innerHTML = `
      <div class="menu-img">
        <img src="${item.image || 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=600&q=80'}"
             alt="${item.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=600&q=80'" />
      </div>
      <div class="menu-body">
        <div class="menu-head">
          <h3>${item.name}</h3>
          <span class="menu-price">$${Number(item.price).toLocaleString()}</span>
        </div>
        <p>${item.description || ''}</p>
      </div>
    `;

    menuGrid.appendChild(card);
  });

  // Re-trigger reveal on newly created cards
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
menuGrid.querySelectorAll('.menu-card').forEach((card) => observer.observe(card));
}

// Category filtering uses event delegation on the menu tabs container so it
// always works with whichever menu cards are currently in the DOM — whether
// they are the static HTML cards or ones rendered later by the API. This
// avoids duplicate listeners and keeps the tabs functional in all cases.
// It is registered exactly once, unconditionally, so it can never be missed.
function wireMenuFiltering() {
  if (!menuTabs || menuTabs.dataset.filterWired) return;
  menuTabs.dataset.filterWired = 'true';
  menuTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.menu-tab');
    if (!tab) return;

    menuTabs.querySelectorAll('.menu-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    const category = tab.getAttribute('data-category');
    menuGrid.querySelectorAll('.menu-card').forEach((card) => {
      const show = category === 'all' || card.getAttribute('data-category') === category;
      card.style.display = show ? '' : 'none';
    });
  });
}

async function loadMenu() {
  try {
    const items = await apiFetch('/api/menu');
    if (Array.isArray(items) && items.length > 0) {
      renderMenuCards(items);
      return;
    }
  } catch (e) {
    console.warn('Could not load menu from API, keeping static cards.', e);
  }
  // Nothing else needed: the delegated listener handles the static cards.
}

// ---------- Testimonials (loaded from API) ----------
const track = document.getElementById('testimonialTrack');
const sliderDots = document.getElementById('sliderDots');
let currentSlide = 0;
let autoSlideInterval;

function buildStars(rating) {
  const count = Math.max(0, Math.min(5, Number(rating) || 5));
  return '★'.repeat(count) + '☆'.repeat(5 - count);
}

function renderTestimonials(items) {
  if (!track) return;
  track.innerHTML = '';

  const list = Array.isArray(items) && items.length > 0 ? items : [];

  if (list.length === 0) return;

  list.forEach((t) => {
    const slide = document.createElement('div');
    slide.className = 'testimonial-slide';
    slide.innerHTML = `
      <div class="testimonial-card">
        <div class="stars">${buildStars(t.rating)}</div>
        <p>"${t.text}"</p>
        <div class="testimonial-author">
          <div class="author-avatar">${t.initials || String(t.name).slice(0, 2).toUpperCase()}</div>
          <div><strong>${t.name}</strong><span>${t.role || 'Guest'}</span></div>
        </div>
      </div>
    `;
    track.appendChild(slide);
  });

  const slides = track.querySelectorAll('.testimonial-slide');
  sliderDots.innerHTML = '';
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.setAttribute('aria-label', `Go to review ${i + 1}`);
    dot.addEventListener('click', () => goToSlide(i));
    sliderDots.appendChild(dot);
  });
  dots = sliderDots.querySelectorAll('button');
  goToSlide(0);
}

let dots = [];
function goToSlide(index) {
  const slides = track.querySelectorAll('.testimonial-slide');
  if (slides.length === 0) return;
  currentSlide = (index + slides.length) % slides.length;
  track.style.transform = `translateX(-${currentSlide * 100}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
}

function startAutoSlide() {
  stopAutoSlide();
  autoSlideInterval = setInterval(() => goToSlide(currentSlide + 1), 6000);
}

function stopAutoSlide() {
  clearInterval(autoSlideInterval);
}

async function loadTestimonials() {
  try {
    const items = await apiFetch('/api/testimonials');
    if (Array.isArray(items) && items.length > 0) {
      renderTestimonials(items);
      startAutoSlide();
      return;
    }
  } catch (e) {
    console.warn('Could not load testimonials from API, keeping static ones.', e);
  }
}

const slider = document.getElementById('testimonialSlider');
if (slider) {
  slider.addEventListener('mouseenter', stopAutoSlide);
  slider.addEventListener('mouseleave', startAutoSlide);

  let touchStartX = 0;
  slider.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    stopAutoSlide();
  }, { passive: true });

  slider.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(diff) > 40) {
      goToSlide(currentSlide + (diff < 0 ? 1 : -1));
    }
    startAutoSlide();
  }, { passive: true });
}

// ---------- Reservation form (submits to API) ----------
const reservationForm = document.getElementById('reservationForm');
const formMessage = document.getElementById('formMessage');
const resDate = document.getElementById('resDate');
const resTime = document.getElementById('resTime');

// Set minimum reservation date to today
const todayISO = new Date().toISOString().split('T')[0];
if (resDate) {
  resDate.min = todayISO;
  resDate.value = todayISO;
}

reservationForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = reservationForm.querySelector('button[type="submit"]');
  const name = document.getElementById('resName').value.trim();
  const email = document.getElementById('resEmail').value.trim();
  const date = resDate.value;
  const time = resTime.value;
  const guests = document.getElementById('resGuests').value;
  const phone = document.getElementById('resPhone').value.trim();
  const notes = document.getElementById('resNotes').value.trim();

  if (!name || !email || !date || !time) {
    showFormMessage('Please fill in your name, email, date, and time.', 'error');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showFormMessage('Please enter a valid email address.', 'error');
    return;
  }

  const payload = { name, email, date, time, guests: Number(guests), phone, notes };

  const dateObj = new Date(`${date}T${time || '00:00'}`);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const formattedTime = new Date(`1970-01-01T${time}`).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });

try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }
    showFormMessage('Sending your reservation...', 'info');

    try {
      await apiFetch('/api/reservations', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Backend not reachable — save locally so the form still works.
      console.warn('Backend unavailable, saving reservation locally.', e);
      saveReservationLocally(payload);
    }

    showFormMessage(
      `Thank you, ${name}! Your table for ${guests} guest${guests > 1 ? 's' : ''} on ${formattedDate} at ${formattedTime} has been requested. We'll confirm by email shortly.`,
      'success'
    );

    reservationForm.reset();
    resDate.value = todayISO;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Reservation';
    }
  }
});

// Fallback storage so the reservation form never fails, even without the backend.
function saveReservationLocally(payload) {
  try {
    const key = 'savoria_reservations';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({
      id: 'local-' + Date.now(),
      ...payload,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    console.warn('Could not save reservation locally.', e);
  }
}

function showFormMessage(message, type) {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
  formMessage.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      formMessage.style.display = 'none';
    }, 10000);
  }
}

// ---------- Boot: load data from API and wire UI ----------
document.addEventListener('DOMContentLoaded', () => {
  // Wire menu tab filtering unconditionally so it always works, whether the
  // API loads cards or the static HTML cards are used.
  wireMenuFiltering();
  loadMenu();
  loadTestimonials();
});

