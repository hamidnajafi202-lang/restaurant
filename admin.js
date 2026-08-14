/**
 * Savoria Restaurant — Admin Panel JavaScript
 * Manages login, dashboard, menu, reservations, orders, and testimonials.
 */

// ---------- State ----------
let adminToken = localStorage.getItem('savoriaAdminToken') || null;
let currentItems = [];
let reservations = [];
let orders = [];
let testimonials = [];

// ---------- API helpers ----------
function getApiBase() {
  const urls = [];
  if (window.location.protocol !== 'file:') {
    urls.push(window.location.origin);
  }
  urls.push('http://localhost:4000');
  urls.push('http://127.0.0.1:4000');
  return [...new Set(urls)];
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
  let lastError = null;
  for (const base of getApiBase()) {
    try {
      const res = await fetch(`${base}${path}`, { ...options, headers });
      if (res.ok) return await res.json();
      lastError = new Error(await res.text().then((t) => { try { return JSON.parse(t).error; } catch { return t; } }) || `Request failed (${res.status})`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Network error');
}

// ---------- Login ----------
const loginForm = document.getElementById('loginForm');
const loginPassword = document.getElementById('loginPassword');
const loginMessage = document.getElementById('loginMessage');
const loginScreen = document.getElementById('loginScreen');
const app = document.getElementById('app');

async function handleLogin(event) {
  event.preventDefault();
  loginMessage.textContent = '';
  const password = loginPassword.value.trim();
  if (!password) {
    loginMessage.textContent = 'Please enter your password.';
    return;
  }
  loginMessage.textContent = 'Signing in...';
  try {
    const result = await apiFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    adminToken = result.token;
    localStorage.setItem('savoriaAdminToken', adminToken);
    loginScreen.style.display = 'none';
    app.style.display = 'flex';
    await loadAllData();
    startAutoRefresh();
  } catch (err) {
    loginMessage.textContent = err.message || 'Login failed. Please try again.';
  }
}

loginForm.addEventListener('submit', handleLogin);

// ---------- Logout ----------
document.getElementById('logoutBtn').addEventListener('click', () => {
  adminToken = null;
  stopAutoRefresh();
  localStorage.removeItem('savoriaAdminToken');
  loginScreen.style.display = 'flex';
  app.style.display = 'none';
  loginPassword.value = '';
});

// ---------- Panel Navigation ----------
const navLinks = document.querySelectorAll('.nav-link');
const panels = {
  dashboard: document.getElementById('panel-dashboard'),
  menu: document.getElementById('panel-menu'),
  reservations: document.getElementById('panel-reservations'),
  orders: document.getElementById('panel-orders'),
  testimonials: document.getElementById('panel-testimonials')
};
const panelTitles = {
  dashboard: 'Dashboard',
  menu: 'Menu Manager',
  reservations: 'Reservations',
  orders: 'Orders',
  testimonials: 'Testimonials'
};

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const panel = link.getAttribute('data-panel');
    if (!panel || !panels[panel]) return;
    navLinks.forEach((l) => l.classList.remove('active'));
    link.classList.add('active');
    Object.entries(panels).forEach(([key, el]) => {
      el.style.display = key === panel ? '' : 'none';
    });
    document.getElementById('panelTitle').textContent = panelTitles[panel];
  });
});

// ---------- Load all data ----------
async function loadAllData() {
  try {
    const [menuRes, resRes, ordRes, testRes] = await Promise.allSettled([
      apiFetch('/api/menu'),
      apiFetch('/api/reservations'),
      apiFetch('/api/orders'),
      apiFetch('/api/testimonials')
    ]);
    if (menuRes.status === 'fulfilled') currentItems = menuRes.value;
    if (resRes.status === 'fulfilled') reservations = resRes.value;
    if (ordRes.status === 'fulfilled') orders = ordRes.value;
    if (testRes.status === 'fulfilled') testimonials = testRes.value;
    renderAll();
    updateLastUpdated();
  } catch (err) {
    console.error('Failed to load data', err);
  }
}

function updateLastUpdated() {
  const el = document.getElementById('lastUpdated');
  if (el) {
    el.textContent = '✓ Updated ' + new Date().toLocaleTimeString();
  }
}

// ---------- Render helpers ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function formatMoney(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso || '';
  }
}

function statusBadge(status) {
  const cls = status ? `status-${status.toLowerCase()}` : 'status-pending';
  return `<span class="status-badge ${cls}">${escapeHtml(status || 'pending')}</span>`;
}

// ---------- Dashboard ----------
function renderDashboard() {
  const totalOrders = orders.length;
  const totalReservations = reservations.length;
  const totalMenu = currentItems.length;
  const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  document.getElementById('statOrders').textContent = totalOrders;
  document.getElementById('statReservations').textContent = totalReservations;
  document.getElementById('statMenu').textContent = totalMenu;
  document.getElementById('statRevenue').textContent = formatMoney(revenue);

  const recentOrdersEl = document.getElementById('recentOrders');
  const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  recentOrdersEl.innerHTML = sortedOrders.length
    ? sortedOrders.map((o) => `
      <li>
        <div>
          <div class="recent-name">${escapeHtml(o.customer?.name || 'Guest')}</div>
          <div class="recent-meta">${(o.items || []).map((i) => `${escapeHtml(i.name)} × ${i.qty}`).join(', ') || '—'}</div>
        </div>
        <div style="text-align:right;">
          <div class="recent-car">${formatMoney(o.total)}</div>
          <div class="recent-date">${escapeHtml(o.status || 'received')}</div>
        </div>
      </li>
    `).join('')
    : '<li class="empty-state">No orders yet</li>';

  const recentResEl = document.getElementById('recentReservations');
  const sortedRess = [...reservations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  recentResEl.innerHTML = sortedRess.length
    ? sortedRess.map((r) => `
      <li>
        <div>
          <div class="recent-name">${escapeHtml(r.name)}</div>
          <div class="recent-meta">${escapeHtml(r.date)} • ${escapeHtml(r.time)} • ${r.guests} guests</div>
        </div>
        <div style="text-align:right;">
          <div class="recent-date">${escapeHtml(r.status || 'pending')}</div>
        </div>
      </li>
    `).join('')
    : '<li class="empty-state">No reservations yet</li>';
}

// ---------- Menu Manager ----------
const menuSearch = document.getElementById('menuSearch');
const menuFilter = document.getElementById('menuFilter');
const menuTableBody = document.getElementById('menuTableBody');
const menuModal = document.getElementById('menuModal');
const menuForm = document.getElementById('menuForm');
const menuId = document.getElementById('menuId');
const menuName = document.getElementById('menuName');
const menuPrice = document.getElementById('menuPrice');
const menuCategory = document.getElementById('menuCategory');
const menuDescription = document.getElementById('menuDescription');
const menuImage = document.getElementById('menuImage');
const menuModalTitle = document.getElementById('menuModalTitle');

function renderMenu() {
  const q = menuSearch.value.trim().toLowerCase();
  const cat = menuFilter.value;
  const filtered = currentItems.filter((item) => {
    const matchesQuery = !q || (item.name || '').toLowerCase().includes(q);
    const matchesCat = !cat || item.category === cat;
    return matchesQuery && matchesCat;
  });

  menuTableBody.innerHTML = filtered.length
    ? filtered.map((item) => `
      <tr>
        <td>${item.image ? `<img class="table-img" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />` : '—'}</td>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${escapeHtml(item.category || '')}</td>
        <td class="cell-gold">${formatMoney(item.price)}</td>
        <td>
          <button class="action-btn gold" onclick="editMenu('${item.id}')">✏️ Edit</button>
          <button class="action-btn red" onclick="deleteMenu('${item.id}')">🗑️ Delete</button>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="5" class="empty-state">No menu items found</td></tr>';
}

menuSearch.addEventListener('input', renderMenu);
menuFilter.addEventListener('change', renderMenu);

document.getElementById('addMenuBtn').addEventListener('click', () => {
  menuForm.reset();
  menuId.value = '';
  menuModalTitle.textContent = 'Add Menu Item';
  openModal(menuModal);
});

document.getElementById('closeMenuModal').addEventListener('click', () => closeModal(menuModal));
document.getElementById('cancelMenuModal').addEventListener('click', () => closeModal(menuModal));

menuForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: menuName.value.trim(),
    price: Number(menuPrice.value),
    category: menuCategory.value,
    description: menuDescription.value.trim(),
    image: menuImage.value.trim()
  };
  if (!payload.name || !payload.price || !payload.category) {
    alert('Please fill in name, price, and category.');
    return;
  }
  try {
    if (menuId.value) {
      await apiFetch(`/api/menu/${menuId.value}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/menu', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal(menuModal);
    await loadAllData();
  } catch (err) {
    alert(err.message || 'Failed to save menu item.');
  }
});

window.editMenu = async function (id) {
  const item = currentItems.find((m) => String(m.id) === String(id));
  if (!item) return;
  menuId.value = item.id;
  menuName.value = item.name || '';
  menuPrice.value = item.price || '';
  menuCategory.value = item.category || 'starters';
  menuDescription.value = item.description || '';
  menuImage.value = item.image || '';
  menuModalTitle.textContent = 'Edit Menu Item';
  openModal(menuModal);
};

window.deleteMenu = async function (id) {
  if (!confirm('Delete this menu item?')) return;
  try {
    await apiFetch(`/api/menu/${id}`, { method: 'DELETE' });
    await loadAllData();
  } catch (err) {
    alert(err.message || 'Failed to delete menu item.');
  }
};

// ---------- Reservations ----------
const resSearch = document.getElementById('resSearch');
const resStatusFilter = document.getElementById('resStatusFilter');
const reservationsTableBody = document.getElementById('reservationsTableBody');

function renderReservations() {
  const q = resSearch.value.trim().toLowerCase();
  const status = resStatusFilter.value;
  const filtered = reservations.filter((r) => {
    const matchesQuery = !q || (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q);
    const matchesStatus = !status || r.status === status;
    return matchesQuery && matchesStatus;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  reservationsTableBody.innerHTML = filtered.length
    ? filtered.map((r) => `
      <tr>
        <td>
          <strong>${escapeHtml(r.name)}</strong>
          <div class="cell-email">${escapeHtml(r.email)}</div>
        </td>
        <td>${escapeHtml(r.date)}<div class="cell-email">${escapeHtml(r.time)}</div></td>
        <td>${r.guests}</td>
        <td>${escapeHtml(r.phone || '—')}</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          <button class="action-btn green" onclick="updateReservation('${r.id}','confirmed')">✓ Confirm</button>
          <button class="action-btn blue" onclick="updateReservation('${r.id}','completed')">✔ Complete</button>
          <button class="action-btn red" onclick="updateReservation('${r.id}','cancelled')">✕ Cancel</button>
          <button class="action-btn red" onclick="deleteReservation('${r.id}')">🗑️</button>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="empty-state">No reservations found</td></tr>';
}

resSearch.addEventListener('input', renderReservations);
resStatusFilter.addEventListener('change', renderReservations);

window.updateReservation = async function (id, status) {
  try {
    await apiFetch(`/api/reservations/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    await loadAllData();
  } catch (err) {
    alert(err.message || 'Failed to update reservation.');
  }
};

window.deleteReservation = async function (id) {
  if (!confirm('Delete this reservation?')) return;
  try {
    await apiFetch(`/api/reservations/${id}`, { method: 'DELETE' });
    await loadAllData();
  } catch (err) {
    alert(err.message || 'Failed to delete reservation.');
  }
};

// ---------- Orders ----------
const orderSearch = document.getElementById('orderSearch');
const orderStatusFilter = document.getElementById('orderStatusFilter');
const ordersTableBody = document.getElementById('ordersTableBody');

function renderOrders() {
  const q = orderSearch.value.trim().toLowerCase();
  const status = orderStatusFilter.value;
  const filtered = orders.filter((o) => {
    const matchesQuery = !q || (o.customer?.name || '').toLowerCase().includes(q) || (o.id || '').toLowerCase().includes(q);
    const matchesStatus = !status || o.status === status;
    return matchesQuery && matchesStatus;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  ordersTableBody.innerHTML = filtered.length
    ? filtered.map((o) => `
      <tr>
        <td class="cell-gold">#${escapeHtml((o.id || '').slice(0, 6))}</td>
        <td>
          <strong>${escapeHtml(o.customer?.name || 'Guest')}</strong>
          <div class="cell-email">${escapeHtml(o.customer?.email || '')}</div>
        </td>
        <td>${escapeHtml(o.deliveryType || 'pickup')}</td>
        <td>${(o.items || []).map((i) => `${escapeHtml(i.name)} × ${i.qty}`).join(', ') || '—'}</td>
        <td class="cell-gold">${formatMoney(o.total)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>
          <button class="action-btn blue" onclick="viewOrder('${o.id}')">👁️ View</button>
          <button class="action-btn gold" onclick="updateOrder('${o.id}','preparing')">🍳 Prep</button>
          <button class="action-btn green" onclick="updateOrder('${o.id}','ready')">✅ Ready</button>
          <button class="action-btn green" onclick="updateOrder('${o.id}','delivered')">🚚 Deliver</button>
          <button class="action-btn red" onclick="updateOrder('${o.id}','cancelled')">✕ Cancel</button>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="7" class="empty-state">No orders found</td></tr>';
}

orderSearch.addEventListener('input', renderOrders);
orderStatusFilter.addEventListener('change', renderOrders);

window.updateOrder = async function (id, status) {
  try {
    await apiFetch(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    await loadAllData();
  } catch (err) {
    alert(err.message || 'Failed to update order.');
  }
};

const orderModal = document.getElementById('orderModal');
const orderDetailsContent = document.getElementById('orderDetailsContent');
document.getElementById('closeOrderModal').addEventListener('click', () => closeModal(orderModal));

window.viewOrder = function (id) {
  const o = orders.find((x) => String(x.id) === String(id));
  if (!o) return;
  const itemsHtml = (o.items || []).map((item) => `
    <li>
      <span>${escapeHtml(item.name)} × ${item.qty}</span>
      <span>${formatMoney(item.subtotal)}</span>
    </li>
  `).join('');

  orderDetailsContent.innerHTML = `
    <div class="order-detail-section">
      <h4>Customer</h4>
      <p><strong>${escapeHtml(o.customer?.name || 'Guest')}</strong></p>
      <p>${escapeHtml(o.customer?.email || '')}</p>
      ${o.customer?.phone ? `<p>📞 ${escapeHtml(o.customer.phone)}</p>` : ''}
    </div>
    <div class="order-detail-section">
      <h4>Delivery</h4>
      <p>Type: <strong>${escapeHtml(o.deliveryType || 'pickup')}</strong></p>
      ${o.address ? `<p>Address: ${escapeHtml(o.address)}</p>` : ''}
      <p>Ordered: ${formatDate(o.createdAt)}</p>
      <p>Status: ${statusBadge(o.status)}</p>
    </div>
    <div class="order-detail-section">
      <h4>Items</h4>
      <ul class="order-items">${itemsHtml || '<li><span>No items</span></li>'}</ul>
    </div>
    <div class="order-detail-section" style="border-bottom:none;">
      <p>Subtotal: ${formatMoney(o.subtotal)}</p>
      <p>Delivery: ${formatMoney(o.deliveryFee)}</p>
      <p>Tax: ${formatMoney(o.tax)}</p>
      <div class="order-total">Total: ${formatMoney(o.total)}</div>
    </div>
  `;
  openModal(orderModal);
};

// ---------- Testimonials ----------
const testimonialsTableBody = document.getElementById('testimonialsTableBody');
const testimonialModal = document.getElementById('testimonialModal');
const testimonialForm = document.getElementById('testimonialForm');
const testName = document.getElementById('testName');
const testRole = document.getElementById('testRole');
const testRating = document.getElementById('testRating');
const testText = document.getElementById('testText');

function renderTestimonials() {
  testimonialsTableBody.innerHTML = testimonials.length
    ? testimonials.map((t) => `
      <tr>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td>${escapeHtml(t.role || 'Guest')}</td>
        <td class="cell-gold">${'★'.repeat(Math.max(1, Math.min(5, Number(t.rating) || 5)))}</td>
        <td>${escapeHtml(t.text).slice(0, 80)}${(t.text || '').length > 80 ? '...' : ''}</td>
        <td>
          <button class="action-btn red" onclick="deleteTestimonial('${t.id}')">🗑️ Delete</button>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="5" class="empty-state">No testimonials yet</td></tr>';
}

document.getElementById('addTestimonialBtn').addEventListener('click', () => {
  testimonialForm.reset();
  openModal(testimonialModal);
});

document.getElementById('closeTestimonialModal').addEventListener('click', () => closeModal(testimonialModal));
document.getElementById('cancelTestimonialModal').addEventListener('click', () => closeModal(testimonialModal));

testimonialForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: testName.value.trim(),
    role: testRole.value.trim(),
    rating: Number(testRating.value),
    text: testText.value.trim()
  };
  if (!payload.name || !payload.text) {
    alert('Please provide a name and review text.');
    return;
  }
  try {
    await apiFetch('/api/testimonials', { method: 'POST', body: JSON.stringify(payload) });
    closeModal(testimonialModal);
    await loadAllData();
  } catch (err) {
    alert(err.message || 'Failed to save testimonial.');
  }
});

window.deleteTestimonial = async function (id) {
  if (!confirm('Delete this testimonial?')) return;
  try {
    await apiFetch(`/api/testimonials/${id}`, { method: 'DELETE' });
    await loadAllData();
  } catch (err) {
    alert(err.message || 'Failed to delete testimonial.');
  }
};

// ---------- Modal helpers ----------
function openModal(modal) {
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

document.querySelectorAll('.modal').forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(closeModal);
  }
});

// ---------- Refresh ----------
document.getElementById('refreshBtn').addEventListener('click', async () => {
  await loadAllData();
});

// ---------- Auto-refresh polling ----------
// Poll the API every 5 seconds so new orders/reservations appear automatically.
let autoRefreshTimer = null;

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(async () => {
    if (!adminToken) return;
    try {
      const [menuRes, resRes, ordRes, testRes] = await Promise.allSettled([
        apiFetch('/api/menu'),
        apiFetch('/api/reservations'),
        apiFetch('/api/orders'),
        apiFetch('/api/testimonials')
      ]);
      if (menuRes.status === 'fulfilled') currentItems = menuRes.value;
      if (resRes.status === 'fulfilled') reservations = resRes.value;
      if (ordRes.status === 'fulfilled') orders = ordRes.value;
      if (testRes.status === 'fulfilled') testimonials = testRes.value;
      renderAll();
    } catch (err) {
      // Silent fail on background refresh
    }
  }, 5000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

// Refresh when the tab becomes visible again (user switched away and back)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && adminToken) {
    loadAllData();
  }
});

// ---------- Init ----------
function renderAll() {
  renderDashboard();
  renderMenu();
  renderReservations();
  renderOrders();
  renderTestimonials();
}

// Auto-login if token exists
if (adminToken) {
  loginScreen.style.display = 'none';
  app.style.display = 'flex';
  loadAllData();
  startAutoRefresh();
}
