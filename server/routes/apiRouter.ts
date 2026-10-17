import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { dbManager } from '../mysqlDatabase';
import { storageService } from '../../src/services/storage';
import { DEMO_ACCOUNTS } from '../../src/context/AuthContext';

export const apiRouter = Router();

// Initialize DB Manager
dbManager.init().catch(err => {
  console.warn('[DB Manager] Startup notice:', err);
});

// Seed in-memory backend database from initial baseline if empty
try {
  const currentUsers = dbManager.getFallbackItems('users');
  if (currentUsers.length === 0) {
    const demoUsers: any[] = DEMO_ACCOUNTS.map(a => ({
      id: a.profile.id,
      name: a.name,
      email: a.email,
      password: a.password || '123456',
      role: a.role,
      phone: a.profile.phone || '+91 98000 00000',
      department: a.department,
      designation: a.profile.designation,
      employeeId: a.profile.employeeId,
      isFieldWorker: Boolean(a.isFieldWorker)
    }));
    demoUsers.push({
      id: 'usr-admin-master',
      name: 'Vikram Patel',
      email: 'admin@rejoysolar.com',
      password: '123456',
      role: 'Admin',
      phone: '+91 98250 11223',
      department: 'Administration',
      designation: 'Managing Director',
      employeeId: 'EMP001',
      isFieldWorker: false
    });
    dbManager.setFallbackItems('users', demoUsers);
  }

  const collectionsToInit = [
    { key: 'customers', fn: () => storageService.getCustomers() },
    { key: 'leads', fn: () => storageService.getLeads() },
    { key: 'projects', fn: () => storageService.getProjects() },
    { key: 'employees', fn: () => storageService.getEmployees() },
    { key: 'payments', fn: () => storageService.getPayments() },
    { key: 'expenses', fn: () => storageService.getExpenses() },
    { key: 'attendance', fn: () => storageService.getAttendance() },
    { key: 'payslips', fn: () => storageService.getPayslips() },
    { key: 'holidays', fn: () => storageService.getHolidays() },
    { key: 'service_tickets', fn: () => storageService.getServiceTickets() },
    { key: 'amc_contracts', fn: () => storageService.getAMCContracts() },
    { key: 'products', fn: () => storageService.getProducts() },
    { key: 'vendors', fn: () => storageService.getVendors() },
    { key: 'purchase_orders', fn: () => storageService.getPurchaseOrders() },
    { key: 'boms', fn: () => storageService.getBOMs() },
    { key: 'sales_invoices', fn: () => storageService.getSalesInvoices() },
    { key: 'warehouses', fn: () => storageService.getWarehouses() },
    { key: 'stock_movements', fn: () => storageService.getStockMovements() },
    { key: 'stock_audits', fn: () => storageService.getStockAudits() },
    { key: 'quotations', fn: () => storageService.getQuotations() },
    { key: 'surveys', fn: () => storageService.getSurveys() },
    { key: 'notifications', fn: () => storageService.getNotifications() }
  ];

  collectionsToInit.forEach(({ key, fn }) => {
    if (dbManager.getFallbackItems(key).length === 0) {
      try {
        const items = fn();
        if (Array.isArray(items) && items.length > 0) {
          dbManager.setFallbackItems(key, items);
        }
      } catch {}
    }
  });
} catch (e) {
  console.warn('Initial storage seed notice:', e);
}

// ==========================================================
// 1. DATABASE & PRODUCTION MIGRATION APIS
// ==========================================================

// DB Status & Diagnostics
apiRouter.get('/db/status', (_req: Request, res: Response) => {
  const status = dbManager.getStatus();
  res.json({
    success: true,
    ...status,
    message: status.connected
      ? `Connected to MySQL database "${status.database}" on ${status.host}:${status.port}`
      : `Operating with server-side persistent database cache. Connect MySQL via .env or Database Settings.`,
    tables: [
      'solar_users', 'solar_customers', 'solar_leads', 'solar_projects',
      'solar_project_stages', 'solar_site_surveys', 'solar_quotations',
      'solar_payments', 'solar_expenses', 'solar_employees', 'solar_attendance',
      'solar_payslips', 'solar_holidays', 'solar_service_tickets', 'solar_amc_contracts',
      'solar_notifications', 'solar_products', 'solar_vendors', 'solar_purchase_orders',
      'solar_boms', 'solar_sales_invoices', 'solar_warehouses', 'solar_stock_movements',
      'solar_stock_audits', 'solar_acl_config', 'solar_acl_audit_logs',
      'solar_system_settings', 'solar_workforce_locations'
    ]
  });
});

// Test custom MySQL connection
apiRouter.post('/db/test-connection', async (req: Request, res: Response) => {
  const { host, port, user, password, database } = req.body || {};
  const result = await dbManager.testConnection({
    host: host || 'localhost',
    port: Number(port) || 3306,
    user: user || 'root',
    password: password || '',
    database: database || 'solarpulse_erp'
  });
  res.json(result);
});

// Push schema and migrate all existing data
apiRouter.post('/db/migrate', async (req: Request, res: Response) => {
  const customConfig = req.body || {};
  const result = await dbManager.runFullMigration(customConfig);
  res.json(result);
});

// Download standalone SQL database dump
apiRouter.get(['/db/dump.sql', '/db/export-sql'], (_req: Request, res: Response) => {
  const dumpPath = path.join(process.cwd(), 'database.sql');
  if (fs.existsSync(dumpPath)) {
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', 'attachment; filename="solarpulse_production_mysql.sql"');
    fs.createReadStream(dumpPath).pipe(res);
  } else {
    res.status(404).json({ success: false, error: 'Database dump file not found.' });
  }
});

// ==========================================================
// 2. MASTER BOOTSTRAP API (ONE ROUND-TRIP HYDRATION)
// ==========================================================

apiRouter.get('/bootstrap', async (_req: Request, res: Response) => {
  try {
    const data = await dbManager.getAllData();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Bootstrap load error' });
  }
});

// Bulk sync endpoint for data updates
apiRouter.post('/sync/push', async (req: Request, res: Response) => {
  try {
    const { collection, item, items, action } = req.body || {};
    if (!collection) {
      res.status(400).json({ success: false, message: 'Collection name is required.' });
      return;
    }

    if (items && Array.isArray(items)) {
      dbManager.setFallbackItems(collection, items);
      res.json({ success: true, count: items.length, message: `Synced ${collection}` });
      return;
    }

    if (item && action === 'delete') {
      const current = dbManager.getFallbackItems(collection).filter((i: any) => i.id !== item.id);
      dbManager.setFallbackItems(collection, current);
      res.json({ success: true, message: `Deleted from ${collection}` });
      return;
    }

    if (item) {
      const current = dbManager.getFallbackItems(collection);
      const idx = current.findIndex((i: any) => i.id === item.id);
      if (idx >= 0) current[idx] = { ...current[idx], ...item };
      else current.unshift(item);
      dbManager.setFallbackItems(collection, current);
      res.json({ success: true, data: item, message: `Saved to ${collection}` });
      return;
    }

    res.status(400).json({ success: false, message: 'Invalid sync payload.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Sync error' });
  }
});

// ==========================================================
// 3. AUTHENTICATION APIS (MYSQL BACKED)
// ==========================================================

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required.' });
    return;
  }

  const user = await dbManager.authenticateUser(email, password);
  if (user) {
    res.json({
      success: true,
      user,
      token: `token_${user.id}_${Date.now()}`,
      message: 'Authentication successful.'
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid email or password. Please verify credentials.'
    });
  }
});

apiRouter.post('/auth/customer-login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Customer email and password required.' });
    return;
  }
  const user = await dbManager.authenticateUser(email, password);
  if (user && user.role === 'Customer') {
    res.json({
      success: true,
      user,
      token: `cust_token_${user.id}_${Date.now()}`
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid customer portal credentials.'
    });
  }
});

apiRouter.put('/customers/:id/password', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { password } = req.body || {};
  if (!password || String(password).trim().length < 6) {
    res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    return;
  }

  const success = await dbManager.updateCustomerPassword(id, String(password).trim());
  res.json({ success, message: 'Customer portal password updated successfully in MySQL.' });
});

// ==========================================================
// 4. CUSTOMERS MODULE API
// ==========================================================

apiRouter.get('/customers', async (_req: Request, res: Response) => {
  const customers = await dbManager.getCustomers();
  res.json({ success: true, count: customers.length, data: customers });
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload || !payload.name || !payload.phone) {
    res.status(400).json({ success: false, message: 'Customer name and phone are required.' });
    return;
  }
  const newCust = {
    ...payload,
    id: payload.id || `cust-${Date.now()}`,
    customerCode: payload.customerCode || `CUST-2026-${Math.floor(100 + Math.random() * 900)}`,
    password: payload.password || '123456',
    createdAt: new Date().toISOString()
  };
  const saved = await dbManager.saveCustomer(newCust);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await dbManager.saveCustomer({ ...payload, id });
  res.json({ success: true, data: updated });
});

apiRouter.delete('/customers/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await dbManager.deleteCustomer(id);
  res.json({ success: true, message: 'Customer deleted.' });
});

// ==========================================================
// 5. LEADS MODULE API (CRM)
// ==========================================================

apiRouter.get('/leads', async (_req: Request, res: Response) => {
  const leads = await dbManager.getLeads();
  res.json({ success: true, count: leads.length, data: leads });
});

apiRouter.post('/leads', async (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload || !payload.customerName || !payload.phone) {
    res.status(400).json({ success: false, message: 'Lead customerName and phone required.' });
    return;
  }
  const newLead = {
    ...payload,
    id: payload.id || `lead-${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  const saved = await dbManager.saveLead(newLead);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await dbManager.saveLead({ ...payload, id });
  res.json({ success: true, data: updated });
});

apiRouter.delete('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await dbManager.deleteLead(id);
  res.json({ success: true, message: 'Lead deleted.' });
});

// ==========================================================
// 6. PROJECTS MODULE API
// ==========================================================

apiRouter.get('/projects', async (_req: Request, res: Response) => {
  const projects = await dbManager.getProjects();
  res.json({ success: true, count: projects.length, data: projects });
});

apiRouter.post('/projects', async (req: Request, res: Response) => {
  const payload = req.body;
  const newProj = {
    ...payload,
    id: payload.id || `proj-${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  const saved = await dbManager.saveProject(newProj);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/projects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await dbManager.saveProject({ ...payload, id });
  res.json({ success: true, data: updated });
});

apiRouter.delete('/projects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await dbManager.deleteProject(id);
  res.json({ success: true, message: 'Project deleted.' });
});

// ==========================================================
// 7. EMPLOYEES & HRMS MODULE API
// ==========================================================

apiRouter.get('/employees', async (_req: Request, res: Response) => {
  const items = await dbManager.getEmployees();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/employees', async (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload || !payload.name || !payload.phone) {
    res.status(400).json({ success: false, message: 'Employee name and phone are required.' });
    return;
  }
  const emp = {
    ...payload,
    id: payload.id || `emp-${Date.now()}`,
    employeeCode: payload.employeeCode || `EMP00${dbManager.getFallbackItems('employees').length + 1}`,
    createdAt: new Date().toISOString()
  };
  const saved = await dbManager.saveEmployee(emp);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/employees/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await dbManager.saveEmployee({ ...payload, id });
  res.json({ success: true, data: updated });
});

apiRouter.delete('/employees/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await dbManager.deleteEmployee(id);
  res.json({ success: true, message: 'Employee deleted.' });
});

// Attendance
apiRouter.get('/attendance', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('attendance');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/attendance', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('attendance');
  const att = { ...req.body, id: req.body.id || `att-${Date.now()}` };
  const idx = items.findIndex(a => a.id === att.id);
  if (idx >= 0) items[idx] = att;
  else items.unshift(att);
  dbManager.setFallbackItems('attendance', items);
  res.status(201).json({ success: true, data: att });
});

// Payslips
apiRouter.get('/payslips', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('payslips');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/payslips', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('payslips');
  const ps = { ...req.body, id: req.body.id || `ps-${Date.now()}` };
  const idx = items.findIndex(p => p.id === ps.id);
  if (idx >= 0) items[idx] = ps;
  else items.unshift(ps);
  dbManager.setFallbackItems('payslips', items);
  res.status(201).json({ success: true, data: ps });
});

// Holidays
apiRouter.get('/holidays', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('holidays');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/holidays', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('holidays');
  const h = { ...req.body, id: req.body.id || `hol-${Date.now()}` };
  const idx = items.findIndex(item => item.id === h.id);
  if (idx >= 0) items[idx] = h;
  else items.push(h);
  dbManager.setFallbackItems('holidays', items);
  res.status(201).json({ success: true, data: h });
});

apiRouter.delete('/holidays/:id', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('holidays').filter(h => h.id !== req.params.id);
  dbManager.setFallbackItems('holidays', items);
  res.json({ success: true, message: 'Holiday deleted.' });
});

// ==========================================================
// 8. INVENTORY & SUPPLY CHAIN MODULE APIS
// ==========================================================

// Products
apiRouter.get('/products', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('products');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/products', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('products');
  const prod = { ...req.body, id: req.body.id || `prod-${Date.now()}` };
  const idx = items.findIndex(p => p.id === prod.id);
  if (idx >= 0) items[idx] = prod;
  else items.unshift(prod);
  dbManager.setFallbackItems('products', items);
  res.status(201).json({ success: true, data: prod });
});

apiRouter.put('/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const items = dbManager.getFallbackItems('products');
  const idx = items.findIndex(p => p.id === id);
  if (idx >= 0) items[idx] = { ...items[idx], ...req.body };
  dbManager.setFallbackItems('products', items);
  res.json({ success: true, data: items[idx] || req.body });
});

apiRouter.delete('/products/:id', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('products').filter(p => p.id !== req.params.id);
  dbManager.setFallbackItems('products', items);
  res.json({ success: true, message: 'Product deleted.' });
});

// Vendors
apiRouter.get('/vendors', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('vendors');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/vendors', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('vendors');
  const v = { ...req.body, id: req.body.id || `ven-${Date.now()}` };
  const idx = items.findIndex(x => x.id === v.id);
  if (idx >= 0) items[idx] = v;
  else items.unshift(v);
  dbManager.setFallbackItems('vendors', items);
  res.status(201).json({ success: true, data: v });
});

apiRouter.put('/vendors/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const items = dbManager.getFallbackItems('vendors');
  const idx = items.findIndex(v => v.id === id);
  if (idx >= 0) items[idx] = { ...items[idx], ...req.body };
  dbManager.setFallbackItems('vendors', items);
  res.json({ success: true, data: items[idx] || req.body });
});

apiRouter.delete('/vendors/:id', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('vendors').filter(v => v.id !== req.params.id);
  dbManager.setFallbackItems('vendors', items);
  res.json({ success: true, message: 'Vendor deleted.' });
});

// Purchase Orders
apiRouter.get('/purchase-orders', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('purchase_orders');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/purchase-orders', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('purchase_orders');
  const po = { ...req.body, id: req.body.id || `po-${Date.now()}` };
  const idx = items.findIndex(p => p.id === po.id);
  if (idx >= 0) items[idx] = po;
  else items.unshift(po);
  dbManager.setFallbackItems('purchase_orders', items);
  res.status(201).json({ success: true, data: po });
});

apiRouter.put('/purchase-orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const items = dbManager.getFallbackItems('purchase_orders');
  const idx = items.findIndex(p => p.id === id);
  if (idx >= 0) items[idx] = { ...items[idx], ...req.body };
  dbManager.setFallbackItems('purchase_orders', items);
  res.json({ success: true, data: items[idx] || req.body });
});

// Bill of Materials (BOM)
apiRouter.get('/boms', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('boms');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/boms', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('boms');
  const bom = { ...req.body, id: req.body.id || `bom-${Date.now()}` };
  const idx = items.findIndex(b => b.id === bom.id);
  if (idx >= 0) items[idx] = bom;
  else items.unshift(bom);
  dbManager.setFallbackItems('boms', items);
  res.status(201).json({ success: true, data: bom });
});

apiRouter.put('/boms/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const items = dbManager.getFallbackItems('boms');
  const idx = items.findIndex(b => b.id === id);
  if (idx >= 0) items[idx] = { ...items[idx], ...req.body };
  dbManager.setFallbackItems('boms', items);
  res.json({ success: true, data: items[idx] || req.body });
});

// Sales Invoices
apiRouter.get('/sales-invoices', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('sales_invoices');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/sales-invoices', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('sales_invoices');
  const inv = { ...req.body, id: req.body.id || `inv-${Date.now()}` };
  const idx = items.findIndex(i => i.id === inv.id);
  if (idx >= 0) items[idx] = inv;
  else items.unshift(inv);
  dbManager.setFallbackItems('sales_invoices', items);
  res.status(201).json({ success: true, data: inv });
});

apiRouter.put('/sales-invoices/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const items = dbManager.getFallbackItems('sales_invoices');
  const idx = items.findIndex(i => i.id === id);
  if (idx >= 0) items[idx] = { ...items[idx], ...req.body };
  dbManager.setFallbackItems('sales_invoices', items);
  res.json({ success: true, data: items[idx] || req.body });
});

// Warehouses
apiRouter.get('/warehouses', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('warehouses');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/warehouses', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('warehouses');
  const wh = { ...req.body, id: req.body.id || `wh-${Date.now()}` };
  const idx = items.findIndex(w => w.id === wh.id);
  if (idx >= 0) items[idx] = wh;
  else items.unshift(wh);
  dbManager.setFallbackItems('warehouses', items);
  res.status(201).json({ success: true, data: wh });
});

// Stock Movements
apiRouter.get('/stock-movements', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('stock_movements');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/stock-movements', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('stock_movements');
  const sm = { ...req.body, id: req.body.id || `sm-${Date.now()}` };
  items.unshift(sm);
  dbManager.setFallbackItems('stock_movements', items);
  res.status(201).json({ success: true, data: sm });
});

// Stock Audits
apiRouter.get('/stock-audits', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('stock_audits');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/stock-audits', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('stock_audits');
  const sa = { ...req.body, id: req.body.id || `audit-${Date.now()}` };
  const idx = items.findIndex(s => s.id === sa.id);
  if (idx >= 0) items[idx] = sa;
  else items.unshift(sa);
  dbManager.setFallbackItems('stock_audits', items);
  res.status(201).json({ success: true, data: sa });
});

// ==========================================================
// 9. QUOTATIONS & SITE SURVEYS
// ==========================================================

apiRouter.get('/quotations', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('quotations');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/quotations', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('quotations');
  const q = { ...req.body, id: req.body.id || `qtn-${Date.now()}` };
  const idx = items.findIndex(item => item.id === q.id);
  if (idx >= 0) items[idx] = q;
  else items.unshift(q);
  dbManager.setFallbackItems('quotations', items);
  res.status(201).json({ success: true, data: q });
});

apiRouter.delete('/quotations/:id', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('quotations').filter(q => q.id !== req.params.id);
  dbManager.setFallbackItems('quotations', items);
  res.json({ success: true, message: 'Quotation deleted.' });
});

// Site Surveys
apiRouter.get('/surveys', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('surveys');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/surveys', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('surveys');
  const s = { ...req.body, id: req.body.id || `sur-${Date.now()}` };
  const idx = items.findIndex(item => item.id === s.id);
  if (idx >= 0) items[idx] = s;
  else items.unshift(s);
  dbManager.setFallbackItems('surveys', items);
  res.status(201).json({ success: true, data: s });
});

// ==========================================================
// 10. FINANCE (PAYMENTS & EXPENSES)
// ==========================================================

apiRouter.get('/payments', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('payments');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/payments', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('payments');
  const pay = { ...req.body, id: req.body.id || `pay-${Date.now()}` };
  const idx = items.findIndex(p => p.id === pay.id);
  if (idx >= 0) items[idx] = pay;
  else items.unshift(pay);
  dbManager.setFallbackItems('payments', items);
  res.status(201).json({ success: true, data: pay });
});

apiRouter.get('/expenses', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('expenses');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/expenses', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('expenses');
  const ex = { ...req.body, id: req.body.id || `exp-${Date.now()}` };
  const idx = items.findIndex(e => e.id === ex.id);
  if (idx >= 0) items[idx] = ex;
  else items.unshift(ex);
  dbManager.setFallbackItems('expenses', items);
  res.status(201).json({ success: true, data: ex });
});

// ==========================================================
// 11. SERVICE TICKETS & AMC CONTRACTS
// ==========================================================

apiRouter.get('/service-tickets', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('service_tickets');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/service-tickets', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('service_tickets');
  const tk = { ...req.body, id: req.body.id || `tk-${Date.now()}` };
  const idx = items.findIndex(t => t.id === tk.id);
  if (idx >= 0) items[idx] = tk;
  else items.unshift(tk);
  dbManager.setFallbackItems('service_tickets', items);
  res.status(201).json({ success: true, data: tk });
});

apiRouter.get('/amc-contracts', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('amc_contracts');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/amc-contracts', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('amc_contracts');
  const amc = { ...req.body, id: req.body.id || `amc-${Date.now()}` };
  const idx = items.findIndex(a => a.id === amc.id);
  if (idx >= 0) items[idx] = amc;
  else items.unshift(amc);
  dbManager.setFallbackItems('amc_contracts', items);
  res.status(201).json({ success: true, data: amc });
});

// ==========================================================
// 12. NOTIFICATIONS & SETTINGS
// ==========================================================

apiRouter.get('/notifications', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('notifications');
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/notifications', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('notifications');
  const n = { ...req.body, id: req.body.id || `notif-${Date.now()}` };
  items.unshift(n);
  dbManager.setFallbackItems('notifications', items);
  res.status(201).json({ success: true, data: n });
});

apiRouter.put('/notifications/:id/read', (req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('notifications');
  const target = items.find(n => n.id === req.params.id);
  if (target) target.isRead = true;
  dbManager.setFallbackItems('notifications', items);
  res.json({ success: true });
});

apiRouter.put('/notifications/read-all', (_req: Request, res: Response) => {
  const items = dbManager.getFallbackItems('notifications');
  items.forEach(n => { n.isRead = true; });
  dbManager.setFallbackItems('notifications', items);
  res.json({ success: true });
});

apiRouter.get('/settings', (_req: Request, res: Response) => {
  const s = dbManager.getFallbackItems('settings');
  res.json({ success: true, data: s[0] || null });
});

apiRouter.post(['/settings', '/settings/update'], (req: Request, res: Response) => {
  const s = req.body;
  dbManager.setFallbackItems('settings', [s]);
  res.json({ success: true, data: s });
});
