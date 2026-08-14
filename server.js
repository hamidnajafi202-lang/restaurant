/**
 * Savoria Restaurant — Backend Server
 * Provides a JSON database and REST API for menu items, reservations, and testimonials.
 *
 * Run with:  node server.js
 * Then visit: http://localhost:4000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const port = process.env.PORT || 4000;
const rootDir = __dirname;
const dataFile = path.join(rootDir, 'data.json');
const adminPassword = process.env.ADMIN_PASSWORD || 'savoria123';

const defaultData = {
  menu: [],
  reservations: [],
  orders: [],
  testimonials: []
};

// ---------------- Data helpers ----------------
function readData() {
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultData, null, 2));
  }
  const raw = fs.readFileSync(dataFile, 'utf8');
  const data = JSON.parse(raw);
  if (!data.menu) data.menu = [];
  if (!data.reservations) data.reservations = [];
  if (!data.orders) data.orders = [];
  if (!data.testimonials) data.testimonials = [];
  return data;
}

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders
  };
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function serveStaticFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => {
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        parsed = {};
      }
      resolve(parsed);
    });
    req.on('error', () => resolve({}));
  });
}

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validReservation(r) {
  return (
    r &&
    typeof r.name === 'string' && r.name.trim().length >= 2 &&
    validEmail(r.email) &&
    typeof r.date === 'string' && r.date.trim() !== '' &&
    typeof r.time === 'string' && r.time.trim() !== ''
  );
}

// ---------------- HTTP server ----------------
const server = http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  const pathname = (reqUrl.pathname || '/').replace(/\/+$/, '') || '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // ================= ADMIN LOGIN =================
  if (req.method === 'POST' && (pathname === '/api/admin/login' || pathname === '/api/admin/login/')) {
    const body = await readBody(req);
    if (body.password === adminPassword) {
      const token = crypto.randomBytes(24).toString('hex');
      sendJson(res, 200, { token, message: 'Login successful' });
    } else {
      sendJson(res, 401, { error: 'Invalid password' });
    }
    return;
  }

  // ================= HEALTH CHECK =================
  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  // ================= MENU ROUTES =================
  // GET /api/menu  |  GET /api/menu?category=pizza  |  GET /api/menu/:id
  if (req.method === 'GET' && pathname.startsWith('/api/menu')) {
    const data = readData();
    const rest = pathname.replace('/api/menu', '').replace(/^\//, '');
    if (rest === '') {
      const category = reqUrl.query.category;
      let items = data.menu;
      if (category) {
        items = items.filter((m) => String(m.category).toLowerCase() === String(category).toLowerCase());
      }
      sendJson(res, 200, items);
    } else {
      const item = data.menu.find((m) => String(m.id) === rest);
      if (!item) return sendJson(res, 404, { error: 'Menu item not found' });
      sendJson(res, 200, item);
    }
    return;
  }

  // POST /api/menu — add a new menu item
  if (req.method === 'POST' && (pathname === '/api/menu' || pathname === '/api/menu/')) {
    const body = await readBody(req);
    if (!body.name || !body.price || !body.category) {
      return sendJson(res, 400, { error: 'name, price, and category are required' });
    }
    const data = readData();
    const item = {
      id: body.id || crypto.randomBytes(6).toString('hex'),
      name: body.name,
      price: Number(body.price),
      category: body.category,
      description: body.description || '',
      image: body.image || ''
    };
    data.menu.push(item);
    writeData(data);
    sendJson(res, 201, item);
    return;
  }

  // PUT /api/menu/:id — update a menu item
  if (req.method === 'PUT' && pathname.startsWith('/api/menu/')) {
    const id = pathname.replace('/api/menu/', '');
    const body = await readBody(req);
    const data = readData();
    const item = data.menu.find((m) => String(m.id) === id);
    if (!item) return sendJson(res, 404, { error: 'Menu item not found' });

    if (body.name !== undefined) item.name = body.name;
    if (body.price !== undefined) item.price = Number(body.price) || item.price;
    if (body.category !== undefined) item.category = body.category;
    if (body.description !== undefined) item.description = body.description;
    if (body.image !== undefined) item.image = body.image;

    writeData(data);
    sendJson(res, 200, item);
    return;
  }

  // DELETE /api/menu/:id — remove a menu item
  if (req.method === 'DELETE' && pathname.startsWith('/api/menu/')) {
    const id = pathname.replace('/api/menu/', '');
    const data = readData();
    const idx = data.menu.findIndex((m) => String(m.id) === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Menu item not found' });
    const [removed] = data.menu.splice(idx, 1);
    writeData(data);
    sendJson(res, 200, { message: 'Menu item deleted', item: removed });
    return;
  }

  // ================= RESERVATION ROUTES =================
  // GET /api/reservations
  if (req.method === 'GET' && (pathname === '/api/reservations' || pathname === '/api/reservations/')) {
    const data = readData();
    sendJson(res, 200, data.reservations);
    return;
  }

  // POST /api/reservations — create a reservation
  if (req.method === 'POST' && (pathname === '/api/reservations' || pathname === '/api/reservations/')) {
    const body = await readBody(req);
    if (!validReservation(body)) {
      return sendJson(res, 400, {
        error: 'Please provide a valid name (min 2 chars), email, date, and time.'
      });
    }
    const data = readData();
    const reservation = {
      id: crypto.randomBytes(8).toString('hex'),
      name: body.name.trim(),
      email: body.email.trim(),
      phone: body.phone ? String(body.phone).trim() : '',
      date: body.date,
      time: body.time,
      guests: Number(body.guests) || 2,
      notes: body.notes || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    data.reservations.push(reservation);
    writeData(data);
    sendJson(res, 201, reservation);
    return;
  }

  // PUT /api/reservations/:id — update a reservation (e.g., change status)
  if (req.method === 'PUT' && pathname.startsWith('/api/reservations/')) {
    const id = pathname.replace('/api/reservations/', '');
    const body = await readBody(req);
    const data = readData();
    const reservation = data.reservations.find((r) => String(r.id) === id);
    if (!reservation) return sendJson(res, 404, { error: 'Reservation not found' });

    if (body.status !== undefined) reservation.status = body.status;
    if (body.name !== undefined) reservation.name = body.name;
    if (body.email !== undefined) reservation.email = body.email;
    if (body.phone !== undefined) reservation.phone = body.phone;
    if (body.date !== undefined) reservation.date = body.date;
    if (body.time !== undefined) reservation.time = body.time;
    if (body.guests !== undefined) reservation.guests = Number(body.guests) || reservation.guests;
    if (body.notes !== undefined) reservation.notes = body.notes;

    writeData(data);
    sendJson(res, 200, reservation);
    return;
  }

  // DELETE /api/reservations/:id — cancel a reservation
  if (req.method === 'DELETE' && pathname.startsWith('/api/reservations/')) {
    const id = pathname.replace('/api/reservations/', '');
    const data = readData();
    const idx = data.reservations.findIndex((r) => String(r.id) === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Reservation not found' });
    const [removed] = data.reservations.splice(idx, 1);
    writeData(data);
    sendJson(res, 200, { message: 'Reservation deleted', reservation: removed });
    return;
  }

// ================= ORDER ROUTES =================
  // GET /api/orders  |  GET /api/orders/:id
  if (req.method === 'GET' && pathname.startsWith('/api/orders')) {
    const data = readData();
    const rest = pathname.replace('/api/orders', '').replace(/^\//, '');
    if (rest === '') {
      sendJson(res, 200, data.orders);
    } else {
      const order = data.orders.find((o) => String(o.id) === rest);
      if (!order) return sendJson(res, 404, { error: 'Order not found' });
      sendJson(res, 200, order);
    }
    return;
  }

  // POST /api/orders — create a delivery/takeaway order
  if (req.method === 'POST' && (pathname === '/api/orders' || pathname === '/api/orders/')) {
    const body = await readBody(req);
    if (!body.customer || !body.customer.name || !validEmail(body.customer.email)) {
      return sendJson(res, 400, { error: 'A valid customer name and email are required.' });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return sendJson(res, 400, { error: 'Your cart is empty. Add at least one item.' });
    }

    const data = readData();
    // Recompute prices from the menu database to prevent tampering
    const items = body.items.map((it) => {
      const menuItem = data.menu.find((m) => String(m.id) === String(it.id));
      const unitPrice = menuItem ? Number(menuItem.price) : Number(it.price) || 0;
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      return {
        id: String(it.id),
        name: menuItem ? menuItem.name : it.name || 'Item',
        qty,
        price: unitPrice,
        subtotal: unitPrice * qty
      };
    });

    const subtotal = items.reduce((sum, it) => sum + it.subtotal, 0);
    const deliveryFee = body.deliveryType === 'delivery' ? 4.99 : 0;
    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const total = Math.round((subtotal + deliveryFee + tax) * 100) / 100;

    const order = {
      id: crypto.randomBytes(8).toString('hex'),
      customer: {
        name: body.customer.name.trim(),
        email: body.customer.email.trim(),
        phone: body.customer.phone ? String(body.customer.phone).trim() : ''
      },
      deliveryType: body.deliveryType === 'pickup' ? 'pickup' : 'delivery',
      address: body.address ? String(body.address).trim() : '',
      items,
      subtotal,
      deliveryFee,
      tax,
      total,
      status: 'received',
      createdAt: new Date().toISOString()
    };

    data.orders.push(order);
    writeData(data);
    sendJson(res, 201, order);
    return;
  }

  // PUT /api/orders/:id — update order status
  if (req.method === 'PUT' && pathname.startsWith('/api/orders/')) {
    const id = pathname.replace('/api/orders/', '');
    const body = await readBody(req);
    const data = readData();
    const order = data.orders.find((o) => String(o.id) === id);
    if (!order) return sendJson(res, 404, { error: 'Order not found' });
    if (body.status !== undefined) order.status = body.status;
    writeData(data);
    sendJson(res, 200, order);
    return;
  }

  // DELETE /api/orders/:id — cancel an order
  if (req.method === 'DELETE' && pathname.startsWith('/api/orders/')) {
    const id = pathname.replace('/api/orders/', '');
    const data = readData();
    const idx = data.orders.findIndex((o) => String(o.id) === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Order not found' });
    const [removed] = data.orders.splice(idx, 1);
    writeData(data);
    sendJson(res, 200, { message: 'Order deleted', order: removed });
    return;
  }

  // ================= TESTIMONIAL ROUTES =================
  // GET /api/testimonials
  if (req.method === 'GET' && (pathname === '/api/testimonials' || pathname === '/api/testimonials/')) {
    const data = readData();
    sendJson(res, 200, data.testimonials);
    return;
  }

  // POST /api/testimonials — add a review
  if (req.method === 'POST' && (pathname === '/api/testimonials' || pathname === '/api/testimonials/')) {
    const body = await readBody(req);
    if (!body.name || !body.text) {
      return sendJson(res, 400, { error: 'name and text are required' });
    }
    const data = readData();
    const testimonial = {
      id: body.id || crypto.randomBytes(8).toString('hex'),
      name: body.name,
      role: body.role || 'Guest',
      initials: body.initials || String(body.name).slice(0, 2).toUpperCase(),
      rating: Number(body.rating) || 5,
      text: body.text
    };
    data.testimonials.push(testimonial);
    writeData(data);
    sendJson(res, 201, testimonial);
    return;
  }

  // DELETE /api/testimonials/:id — remove a review
  if (req.method === 'DELETE' && pathname.startsWith('/api/testimonials/')) {
    const id = pathname.replace('/api/testimonials/', '');
    const data = readData();
    const idx = data.testimonials.findIndex((t) => String(t.id) === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Testimonial not found' });
    const [removed] = data.testimonials.splice(idx, 1);
    writeData(data);
    sendJson(res, 200, { message: 'Testimonial deleted', testimonial: removed });
    return;
  }

  // ================= STATIC FILES =================
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    serveStaticFile(res, path.join(rootDir, 'index.html'), 'text/html; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && pathname === '/style.css') {
    serveStaticFile(res, path.join(rootDir, 'style.css'), 'text/css; charset=utf-8');
    return;
  }
if (req.method === 'GET' && pathname === '/script.js') {
    serveStaticFile(res, path.join(rootDir, 'script.js'), 'application/javascript; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && (pathname === '/order.html' || pathname === '/order')) {
    serveStaticFile(res, path.join(rootDir, 'order.html'), 'text/html; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && pathname === '/order.js') {
    serveStaticFile(res, path.join(rootDir, 'order.js'), 'application/javascript; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && (pathname === '/admin' || pathname === '/admin.html')) {
    serveStaticFile(res, path.join(rootDir, 'admin.html'), 'text/html; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && pathname === '/admin.css') {
    serveStaticFile(res, path.join(rootDir, 'admin.css'), 'text/css; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && pathname === '/admin.js') {
    serveStaticFile(res, path.join(rootDir, 'admin.js'), 'application/javascript; charset=utf-8');
    return;
  }

  sendJson(res, 404, { error: 'Route not found' });
});

server.listen(port, () => {
  console.log(`Savoria Restaurant server running at http://localhost:${port}`);
  console.log(`API endpoints available:`);
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/menu?category=<cat>`);
  console.log(`  POST /api/menu`);
  console.log(`  GET  /api/reservations`);
  console.log(`  POST /api/reservations`);
  console.log(`  GET  /api/testimonials`);
  console.log(`  POST /api/testimonials`);
  console.log(`  DELETE /api/testimonials/:id`);
  console.log(`  Admin panel: http://localhost:${port}/admin`);
});

