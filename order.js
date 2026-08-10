// Savoria Online Ordering & Delivery
// When the page is served over http/https (via the Node server), use relative
// API paths. When opened directly from the file system (file://), fall back to
// the local backend server so the menu and orders still work.
const API_BASE = window.location.protocol === 'file:'
  ? 'http://localhost:4000'
  : '';
const DELIVERY_FEE = 4.99;
const TAX_RATE = 0.08;

// ---------- State ----------
let cart = [];       // [{id, name, price, qty}]
let deliveryType = 'delivery';
let menuItems = [];

// ---------- DOM refs ----------
const orderGrid = document.getElementById('orderGrid');
const orderTabs = document.querySelectorAll('.order-tab');
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

// ---------- API helpers ----------
function api(path, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  }).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  });
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
  const items = category === 'all' ? menuItems : menuItems.filter((m) => m.category === category);
  if (items.length === 0) {
    orderGrid.innerHTML = '<p class="cart-empty">No items in this category.</p>';
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

// ---------- Tabs ----------
orderTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    orderTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    renderMenu(tab.dataset.category);
  });
});

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
