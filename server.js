/**
 * Savoria Restaurant — Backend Server
 * Provides a JSON database and REST API for menu items, reservations, and testimonials.
 *
 * Run with:  node server.js
 * Then visit: http://localhost:4000
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    // Corrupted/partially-written data.json used to crash the whole process
    // (JSON.parse throwing synchronously inside an async route handler).
    // Fall back to a fresh default DB instead of taking the server down.
    console.error('data.json is corrupted, resetting to defaults:', err.message);
    data = { ...defaultData };
    writeData(data);
  }
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

// Supabase stores orders in snake_case; the frontend (order.js/admin.js) expects
// camelCase fields like customer.name, deliveryType, createdAt. Without this
// mapping, GET /api/orders returns raw rows and the admin panel shows orders
// as blank/empty even though they exist in the database.
function mapOrder(data) {
  if (!data) return data;
  return {
    id: data.id,
    customer: {
      name: data.customer_name,
      email: data.customer_email,
      phone: data.customer_phone
    },
    deliveryType: data.delivery_type,
    address: data.address,
    items: data.items,
    subtotal: Number(data.subtotal),
    deliveryFee: Number(data.delivery_fee),
    tax: Number(data.tax),
    total: Number(data.total),
    status: data.status,
    createdAt: data.created_at
  };
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
  // Every route below is handled inside this try/catch. Without it, any
  // unexpected error (bad input, a Supabase client throwing synchronously,
  // etc.) becomes an unhandled promise rejection — which by default crashes
  // the whole Node process instead of just failing the one request.
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error('Unhandled request error:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    } else {
      res.end();
    }
  }
});

async function handleRequest(req, res) {
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
  const rest = pathname.replace('/api/menu', '').replace(/^\//, '');

  let query = supabase
    .from('menu')
    .select('*');

  const category = reqUrl.query.category;

  if (category) {
    query = query.ilike('category', category);
  }

  const { data: items, error } = await query;

  if (error) {
    console.error('Supabase menu error:', error);
    return sendJson(res, 500, {
      error: 'Failed to load menu'
    });
  }

  if (rest === '') {
    sendJson(res, 200, items);
  } else {
    const item = items.find((m) => String(m.id) === rest);

    if (!item) {
      return sendJson(res, 404, {
        error: 'Menu item not found'
      });
    }

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
    const item = {
      id: body.id || crypto.randomBytes(6).toString('hex'),
      name: body.name,
      price: Number(body.price),
      category: body.category,
      description: body.description || '',
      image: body.image || '',
      created_at: Date.now()
    };

    const { data, error } = await supabase
      .from('menu')
      .insert([item])
      .select()
      .single();

    if (error) {
      console.error('Supabase menu INSERT error:', error);
      return sendJson(res, 500, { error: 'Failed to create menu item' });
    }

    sendJson(res, 201, data);
    return;
  }

  // PUT /api/menu/:id — update a menu item
  if (req.method === 'PUT' && pathname.startsWith('/api/menu/')) {
    const id = pathname.replace('/api/menu/', '');
    const body = await readBody(req);

    const updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isNaN(price)) updates.price = price;
    }
    if (body.category !== undefined) updates.category = body.category;
    if (body.description !== undefined) updates.description = body.description;
    if (body.image !== undefined) updates.image = body.image;

    const { data, error } = await supabase
      .from('menu')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase menu UPDATE error:', error);
      return sendJson(res, 500, { error: 'Failed to update menu item' });
    }
    if (!data) return sendJson(res, 404, { error: 'Menu item not found' });

    sendJson(res, 200, data);
    return;
  }

  // DELETE /api/menu/:id — remove a menu item
  if (req.method === 'DELETE' && pathname.startsWith('/api/menu/')) {
    const id = pathname.replace('/api/menu/', '');

    const { data, error } = await supabase
      .from('menu')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase menu DELETE error:', error);
      return sendJson(res, 500, { error: 'Failed to delete menu item' });
    }
    if (!data) return sendJson(res, 404, { error: 'Menu item not found' });

    sendJson(res, 200, { message: 'Menu item deleted', item: data });
    return;
  }

 // ================= RESERVATION ROUTES =================

// GET /api/reservations
if (
  req.method === 'GET' &&
  (pathname === '/api/reservations' || pathname === '/api/reservations/')
) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase reservations error:', error);
    return sendJson(res, 500, {
      error: 'Failed to load reservations'
    });
  }

  sendJson(res, 200, data);
  return;
}

// POST /api/reservations — create a reservation
if (
  req.method === 'POST' &&
  (pathname === '/api/reservations' || pathname === '/api/reservations/')
) {
  const body = await readBody(req);

  if (!validReservation(body)) {
    return sendJson(res, 400, {
      error: 'Please provide a valid name (min 2 chars), email, date, and time.'
    });
  }

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
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('reservations')
    .insert([reservation])
    .select()
    .single();

  if (error) {
    console.error('Supabase reservation error:', error);
    return sendJson(res, 500, {
      error: 'Failed to create reservation'
    });
  }

  sendJson(res, 201, data);
  return;
}

// ================= ORDER ROUTES =================

// GET /api/orders
// GET /api/orders/:id
if (req.method === 'GET' && pathname.startsWith('/api/orders')) {
  const rest = pathname.replace('/api/orders', '').replace(/^\//, '');

  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (rest !== '') {
    query = query.eq('id', rest).single();
  }

  const { data, error } = await query;
if (error) {
  console.error('SUPABASE ORDERS ERROR CODE:', error.code);
  console.error('SUPABASE ORDERS ERROR MESSAGE:', error.message);
  console.error('SUPABASE ORDERS ERROR DETAILS:', error.details);
  console.error('SUPABASE ORDERS ERROR HINT:', error.hint);

  return sendJson(res, 500, {
    error: error.message,
    code: error.code
  });
}

  if (rest !== '') {
    if (!data) {
      return sendJson(res, 404, {
        error: 'Order not found'
      });
    }

    sendJson(res, 200, mapOrder(data));
  } else {
    sendJson(res, 200, (data || []).map(mapOrder));
  }

  return;
}


// POST /api/orders
if (
  req.method === 'POST' &&
  (pathname === '/api/orders' || pathname === '/api/orders/')
) {
  const body = await readBody(req);

  // Validate customer
  if (
    !body.customer ||
    !body.customer.name ||
    !validEmail(body.customer.email)
  ) {
    return sendJson(res, 400, {
      error: 'A valid customer name and email are required.'
    });
  }

  // Validate cart
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return sendJson(res, 400, {
      error: 'Your cart is empty. Add at least one item.'
    });
  }

  // Get menu from Supabase
  const { data: menu, error: menuError } = await supabase
    .from('menu')
    .select('*');

  if (menuError) {
    console.error('Supabase menu error:', menuError);

    return sendJson(res, 500, {
      error: 'Failed to load menu'
    });
  }

  // Recalculate prices from database
  const items = body.items.map((it) => {
    const menuItem = menu.find(
      (m) => String(m.id) === String(it.id)
    );

    const unitPrice = menuItem
      ? Number(menuItem.price)
      : Number(it.price) || 0;

    const qty = Math.max(
      1,
      parseInt(it.qty, 10) || 1
    );

    return {
      id: String(it.id),
      name: menuItem
        ? menuItem.name
        : it.name || 'Item',
      qty,
      price: unitPrice,
      subtotal: unitPrice * qty
    };
  });

  // Calculate totals
  const subtotal = items.reduce(
    (sum, it) => sum + it.subtotal,
    0
  );

  const deliveryFee =
    body.deliveryType === 'delivery' ? 4.99 : 0;

  const tax =
    Math.round(subtotal * 0.08 * 100) / 100;

  const total =
    Math.round(
      (subtotal + deliveryFee + tax) * 100
    ) / 100;

  // Create order
  const order = {
    customer_name: body.customer.name.trim(),
    customer_email: body.customer.email.trim(),
    customer_phone: body.customer.phone
      ? String(body.customer.phone).trim()
      : '',
    delivery_type:
      body.deliveryType === 'pickup'
        ? 'pickup'
        : 'delivery',
    address: body.address
      ? String(body.address).trim()
      : '',
    items,
    subtotal,
    delivery_fee: deliveryFee,
    tax,
    total,
    status: 'received'
  };

  // Insert into Supabase
  const { data, error } = await supabase
    .from('orders')
    .insert([order])
    .select()
    .single();

  if (error) {
    console.error(
      'Supabase order INSERT error:',
      error
    );

    return sendJson(res, 500, {
      error: 'Failed to create order'
    });
  }
  sendJson(res, 201, mapOrder(data));
  return;
}


// PUT /api/orders/:id
if (
  req.method === 'PUT' &&
  pathname.startsWith('/api/orders/')
) {
  const id = pathname.replace('/api/orders/', '');
  const body = await readBody(req);

  const { data, error } = await supabase
    .from('orders')
    .update({
      ...(body.status !== undefined
        ? { status: body.status }
        : {})
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(
      'Supabase order UPDATE error:',
      error
    );

    return sendJson(res, 500, {
      error: 'Failed to update order'
    });
  }

  if (!data) {
    return sendJson(res, 404, {
      error: 'Order not found'
    });
  }

  sendJson(res, 200, mapOrder(data));
  return;
}


// DELETE /api/orders/:id
if (
  req.method === 'DELETE' &&
  pathname.startsWith('/api/orders/')
) {
  const id = pathname.replace('/api/orders/', '');

  const { data, error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(
      'Supabase order DELETE error:',
      error
    );

    return sendJson(res, 500, {
      error: 'Failed to delete order'
    });
  }

  if (!data) {
    return sendJson(res, 404, {
      error: 'Order not found'
    });
  }

  sendJson(res, 200, {
    message: 'Order deleted',
    order: mapOrder(data)
  });

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
}

// Last-resort safety net: catches anything outside the per-request try/catch
// above (e.g. from a timer or a listener firing outside a request). Logs
// instead of letting the default Node behavior kill the process, so a single
// unexpected error can't take the whole server down.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept running):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (server kept running):', reason);
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

