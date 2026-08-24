// Savoria Online Ordering & Delivery
// The page can be viewed several ways: served by our own Node backend
// (localhost:4000), opened directly from disk (file://), or previewed through
// an unrelated static server (e.g. VS Code's Live Server on :5500) that knows
// nothing about our /api routes. Try the current origin first, then fall back
// to the Node backend directly, so ordering works no matter how the page was
// opened.
function getApiBase() {
  const urls = [];
  if (window.location.protocol !== 'file:') {
    urls.push(window.location.origin);
  }
  urls.push('http://localhost:4000');
  urls.push('http://127.0.0.1:4000');
  return [...new Set(urls)];
}
const DELIVERY_FEE = 4.99;
const TAX_RATE = 0.08;

// ---------- State ----------
let cart = [];       // [{id, name, price, qty}]
let deliveryType = 'delivery';
let menuItems = [];

// ---------- DOM refs ----------
const orderGrid = document.getElementById('orderGrid');
const orderTabs = document.querySelectorAll('.order-tab');
const menuSearch = document.getElementById('menuSearch');
const cartItemsEl = document.getElementById('cartItems');
const cartEmptyEl = document.getElementById('cartEmpty');
const cartTotalsEl = document.getElementById('cartTotals');
const cartCountEl = document.getElementById('cartCount');
const deliveryToggle = document.getElementById('deliveryToggle');
const checkoutForm = document.getElementById('checkoutForm');
const orderMsg = document.getElementById('orderMsg');
const cartSubtotalEl = document.getElementById('cartSubtotal');
const cartDeliveryEl = document.getElementById('cartDelivery');
const cartTaxEl = document.getElementById('cartTax');
const cartTotalEl = document.getElementById('cartTotal');
const toastContainer = document.getElementById('toastContainer');
const trackOrderId = document.getElementById('trackOrderId');
const trackOrderBtn = document.getElementById('trackOrderBtn');
const trackResult = document.getElementById('trackResult');

// ---------- Toast Notifications ----------
function showToast(message) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>&#10003;</span> <span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  let lastError = null;
  for (const base of getApiBase()) {
    try {
      const res = await fetch(`${base}${path}`, { ...options, headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        lastError = new Error((data && data.error) || `Request failed (${res.status})`);
        continue;
      }
      return data;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Network error');
}

// ---------- Load Menu ----------
function loadMenu() {
  return api('/api/menu')
    .then((items) => {
      menuItems = items;
      renderMenu('all');
    })
    .catch((err) => {
      orderGrid.innerHTML = `<p class="cart-empty">Could not load menu: ${err.message}</p>`;
    });
}

function renderMenu(category) {
  let items = category === 'all' ? menuItems : menuItems.filter((m) => m.category === category);
  const query = menuSearch ? menuSearch.value.trim().toLowerCase() : '';
  if (query) {
    items = items.filter((m) => m.name.toLowerCase().includes(query) || (m.description && m.description.toLowerCase().includes(query)));
  }

  if (items.length === 0) {
    orderGrid.innerHTML = '<p class="cart-empty">No matching items found.</p>';
    return;
  }
  orderGrid.innerHTML = items.map((item) => `
    <article class="order-card">
      <img src="${item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'}" alt="${item.name}" loading="lazy" />
      <div class="order-card-body">
        <h3>${item.name}</h3>
        <p>${item.description || ''}</p>
        <div class="order-card-foot">
          <span class="order-price">$${Number(item.price).toFixed(2)}</span>
          <button class="add-btn" type="button" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">Add</button>
        </div>
      </div>
    </article>
  `).join('');

  orderGrid.querySelectorAll('.add-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      addToCart({
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: Number(btn.dataset.price)
      });
    });
  });
}

// ---------- Cart ----------
function addToCart(item) {
  const existing = cart.find((c) => c.id === item.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...item, qty: 1 });
  }
  renderCart();
  showToast(`Added ${item.name} to cart!`);
}

function changeQty(id, delta) {
  const item = cart.find((c) => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter((c) => c.id !== id);
  renderCart();
}

function renderCart() {
  const count = cart.reduce((s, c) => s + c.qty, 0);
  cartCountEl.textContent = count;

  if (cart.length === 0) {
    cartEmptyEl.style.display = 'block';
    cartItemsEl.innerHTML = '';
    cartTotalsEl.style.display = 'none';
    deliveryToggle.style.display = 'none';
    checkoutForm.style.display = 'none';
    return;
  }

  cartEmptyEl.style.display = 'none';
  cartItemsEl.innerHTML = cart.map((item) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</div>
      </div>
      <div class="qty-control">
        <button type="button" data-action="dec" data-id="${item.id}">−</button>
        <span>${item.qty}</span>
        <button type="button" data-action="inc" data-id="${item.id}">+</button>
      </div>
    </div>
  `).join('');

  cartTotalsEl.style.display = 'block';
  deliveryToggle.style.display = 'flex';
  checkoutForm.style.display = 'flex';

  updateTotals();

  cartItemsEl.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      changeQty(id, btn.dataset.action === 'inc' ? 1 : -1);
    });
  });
}

function getSubtotal() {
  return cart.reduce((s, c) => s + c.price * c.qty, 0);
}

function updateTotals() {
  const subtotal = getSubtotal();
  const fee = deliveryType === 'delivery' ? DELIVERY_FEE : 0;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + fee + tax;

  cartSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  cartDeliveryEl.textContent = fee > 0 ? `$${fee.toFixed(2)}` : 'Free';
  cartTaxEl.textContent = `$${tax.toFixed(2)}`;
  cartTotalEl.textContent = `$${total.toFixed(2)}`;
}

// ---------- Delivery / Pickup toggle ----------
deliveryToggle.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    deliveryToggle.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    deliveryType = btn.dataset.type;
    const addressField = document.getElementById('custAddress');
    addressField.placeholder = deliveryType === 'delivery'
      ? 'Delivery address (required for delivery)'
      : 'Pickup notes (optional)';
    updateTotals();
  });
});

// ---------- Place order ----------
checkoutForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.getElementById('custName').value.trim();
  const email = document.getElementById('custEmail').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();

  if (!name || !email) {
    showMsg('Please provide your name and email.', 'error');
    return;
  }
  if (deliveryType === 'delivery' && !address) {
    showMsg('Please provide a delivery address.', 'error');
    return;
  }

  const payload = {
    customer: { name, email, phone },
    deliveryType,
    address,
    items: cart.map((c) => ({ id: c.id, qty: c.qty }))
  };

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Placing order...';
  showMsg('', '');

  api('/api/orders', { method: 'POST', body: JSON.stringify(payload) })
    .then((order) => {
      const typeLabel = order.deliveryType === 'delivery' ? `delivered to ${order.address}` : 'ready for pickup';
      showMsg(`Thank you, ${order.customer.name}! Your order (#${order.id}) totaling $${order.total.toFixed(2)} has been received and will be ${typeLabel}.`, 'success');
      cart = [];
      renderCart();
      checkoutForm.reset();
    })
    .catch((err) => {
      showMsg(err.message || 'Could not place order. Please try again.', 'error');
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Place Order';
    });
});

function showMsg(text, type) {
  orderMsg.textContent = text;
  orderMsg.className = 'order-msg' + (type ? ' ' + type : '');
}

// ---------- Search ----------
if (menuSearch) {
  menuSearch.addEventListener('input', () => {
    const activeTab = document.querySelector('.order-tab.active');
    const category = activeTab ? activeTab.dataset.category : 'all';
    renderMenu(category);
  });
}

// ---------- Order Tracking ----------
if (trackOrderBtn) {
  trackOrderBtn.addEventListener('click', () => {
    const id = trackOrderId.value.trim();
    if (!id) {
      trackResult.innerHTML = '<span style="color:#fca5a5;">Please enter an Order ID.</span>';
      trackResult.classList.add('active');
      return;
    }

    trackResult.innerHTML = '<span style="color:#b7a88e;">Searching order status...</span>';
    trackResult.classList.add('active');

    api(`/api/orders/${id}`)
      .then((order) => {
        const statusClass = `status-${order.status || 'received'}`;
        trackResult.innerHTML = `
          <div><strong>Order #${order.id}</strong></div>
          <div>Customer: ${order.customer ? order.customer.name : 'N/A'}</div>
          <div>Total: ${Number(order.total).toFixed(2)}</div>
          <div>Status: <span class="status-badge ${statusClass}">${order.status || 'received'}</span></div>
        `;
      })
      .catch(() => {
        trackResult.innerHTML = '<span style="color:#fca5a5;">Order not found. Check your ID.</span>';
      });
  });
}
orderTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    orderTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    renderMenu(tab.dataset.category);
  });
});

// ---------- Navbar scroll effect ----------
// Without this, the fixed navbar stays permanently transparent on this page,
// so menu photos scroll up and show straight through the logo/nav links.
const navbar = document.getElementById('navbar');
function onNavScroll() {
  if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 60);
}
window.addEventListener('scroll', onNavScroll, { passive: true });
onNavScroll();

// ---------- Mobile nav ----------
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');
hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navLinks.classList.toggle('open');
});

// Close mobile menu when a nav link is clicked
navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navLinks.classList.remove('open');
  });
});

// ---------- Init ----------
loadMenu();
