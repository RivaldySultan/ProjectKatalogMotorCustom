import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SQLITE_FILE = path.resolve(process.env.KATALOG_DB_PATH || path.join(__dirname, "katalogwa.sqlite"));
const DATA_FILE = path.join(__dirname, "data.json");

function getPurchaseSpecifications(value) {
  return String(value || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator <= 0 || !line.slice(separator + 1).trim()) {
        throw new Error("Purchase specifications must use the Label: value format.");
      }
      return {
        label: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim(),
      };
    });
}

class SqliteDatabase {
  constructor() {
    fs.mkdirSync(path.dirname(SQLITE_FILE), { recursive: true });
    this.db = new DatabaseSync(SQLITE_FILE);
    this.initTables();
    this.seedInitialData();
    this.ensureProductPresentation();
  }

  initTables() {
    // Enable foreign keys
    this.db.exec("PRAGMA foreign_keys = ON;");

    // 1. Categories Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Products Table (Relational with Foreign Key to categories)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        price INTEGER NOT NULL,
        stock_status TEXT NOT NULL DEFAULT 'Tersedia',
        description TEXT,
        image TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.ensureProductColumns();

    // 3. Consultation Orders Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        city TEXT,
        build_interest TEXT,
        budget TEXT,
        message TEXT NOT NULL,
        reference_image TEXT,
        reference_images TEXT NOT NULL DEFAULT '[]',
        donor_motor TEXT NOT NULL DEFAULT '',
        reference_product_id TEXT,
        reference_product_name TEXT,
        reference_build_name TEXT,
        reference_build_code TEXT,
        reference_category TEXT,
        reference_basis TEXT,
        reference_price INTEGER,
        consent INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'baru',
        admin_note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
    `);

    this.ensureOrderColumns();
    this.ensureCustomerTables();
    this.ensurePurchaseOrderTable();

    // 4. Settings Key-Value Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // 5. Admin Authentication Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    this.ensureAdminColumns();
    this.ensurePasswordResetTable();

    // Indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_status);
    `);
  }

  ensureProductColumns() {
    const columns = new Set(
      this.db
        .prepare("PRAGMA table_info(products)")
        .all()
        .map((column) => column.name),
    );

    const additions = {
      basis: "TEXT",
      build_name: "TEXT",
      build_code: "TEXT",
      engine: "TEXT",
      transmission: "TEXT",
      cockpit: "TEXT",
      finishing: "TEXT",
      spec_notes: "TEXT",
      image_alt: "TEXT",
      purchase_type: "TEXT NOT NULL DEFAULT 'consultation_only'",
      purchase_enabled: "INTEGER NOT NULL DEFAULT 0",
      purchase_specs: "TEXT NOT NULL DEFAULT ''",
      estimated_build_days: "INTEGER",
      purchase_stock_quantity: "INTEGER NOT NULL DEFAULT 0",
    };

    for (const [name, type] of Object.entries(additions)) {
      if (!columns.has(name)) {
        this.db.exec(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
      }
    }

  }

  ensurePurchaseOrderTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL UNIQUE,
        request_hash TEXT NOT NULL,
        access_token_hash TEXT NOT NULL,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        product_name TEXT NOT NULL,
        build_name TEXT NOT NULL,
        build_code TEXT,
        purchase_type TEXT NOT NULL CHECK (purchase_type IN ('ready_stock', 'made_to_order')),
        basis TEXT NOT NULL,
        category_name TEXT NOT NULL,
        image_snapshot TEXT NOT NULL DEFAULT '',
        specifications TEXT NOT NULL,
        price_snapshot INTEGER NOT NULL CHECK (price_snapshot > 0),
        shipping_method TEXT NOT NULL CHECK (shipping_method IN ('pickup', 'delivery')),
        delivery_address TEXT NOT NULL DEFAULT '',
        shipping_cost INTEGER,
        total_amount INTEGER NOT NULL CHECK (total_amount > 0),
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('gopay', 'seabank')),
        payment_status TEXT NOT NULL DEFAULT 'pending_payment'
          CHECK (payment_status IN ('pending_payment', 'waiting_verification', 'paid', 'rejected', 'expired')),
        approval_status TEXT NOT NULL DEFAULT 'pending_approval'
          CHECK (approval_status IN ('pending_approval', 'approved', 'rejected')),
        approval_rejection_reason TEXT,
        approved_at TEXT,
        description_snapshot TEXT NOT NULL DEFAULT '',
        order_status TEXT NOT NULL
          CHECK (order_status IN ('awaiting_payment', 'awaiting_shipping_quote', 'processing', 'ready_for_pickup', 'ready_to_ship', 'completed', 'cancelled')),
        payment_proof TEXT,
        admin_hidden_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_purchase_orders_created ON purchase_orders(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_purchase_orders_payment_status ON purchase_orders(payment_status);
      CREATE INDEX IF NOT EXISTS idx_purchase_orders_product ON purchase_orders(product_id, payment_status);
    `);
    const columns = new Set(
      this.db.prepare("PRAGMA table_info(purchase_orders)").all().map((column) => column.name),
    );
    if (!columns.has("image_snapshot")) {
      this.db.exec("ALTER TABLE purchase_orders ADD COLUMN image_snapshot TEXT NOT NULL DEFAULT ''");
    }
    if (!columns.has("approval_status")) {
      this.db.exec("ALTER TABLE purchase_orders ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending_approval'");
      this.db.exec("UPDATE purchase_orders SET approval_status = 'approved', approved_at = created_at");
    }
    if (!columns.has("approval_rejection_reason")) {
      this.db.exec("ALTER TABLE purchase_orders ADD COLUMN approval_rejection_reason TEXT");
    }
    if (!columns.has("approved_at")) {
      this.db.exec("ALTER TABLE purchase_orders ADD COLUMN approved_at TEXT");
    }
    if (!columns.has("description_snapshot")) {
      this.db.exec("ALTER TABLE purchase_orders ADD COLUMN description_snapshot TEXT NOT NULL DEFAULT ''");
    }
    if (!columns.has("customer_id")) {
      this.db.exec("ALTER TABLE purchase_orders ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL");
    }
    if (!columns.has("admin_hidden_at")) {
      this.db.exec("ALTER TABLE purchase_orders ADD COLUMN admin_hidden_at TEXT");
    }
    if (!columns.has("customer_hidden_at")) {
      this.db.exec("ALTER TABLE purchase_orders ADD COLUMN customer_hidden_at TEXT");
    }
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_purchase_orders_customer ON purchase_orders(customer_id, created_at DESC)");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_order_events (
        id TEXT PRIMARY KEY,
        purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        label TEXT NOT NULL,
        details TEXT,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'customer', 'admin')),
        actor_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_purchase_events_order ON purchase_order_events(purchase_order_id, created_at, id);
      CREATE TABLE IF NOT EXISTS purchase_payment_proofs (
        id TEXT PRIMARY KEY,
        purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        filename TEXT NOT NULL UNIQUE,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_purchase_proofs_order ON purchase_payment_proofs(purchase_order_id, created_at, id);
    `);
    this.db.prepare(`
      INSERT INTO purchase_order_events (id, purchase_order_id, event_type, label, actor_type, created_at)
      SELECT lower(hex(randomblob(16))), po.id, 'order_created', 'Order created', 'system', po.created_at
      FROM purchase_orders po
      WHERE NOT EXISTS (
        SELECT 1 FROM purchase_order_events e
        WHERE e.purchase_order_id = po.id AND e.event_type = 'order_created'
      )
    `).run();
    this.db.prepare(`
      INSERT INTO purchase_payment_proofs (id, purchase_order_id, filename, created_at)
      SELECT lower(hex(randomblob(16))), po.id, po.payment_proof, po.updated_at
      FROM purchase_orders po
      WHERE po.payment_proof IS NOT NULL AND po.payment_proof != ''
        AND NOT EXISTS (
          SELECT 1 FROM purchase_payment_proofs proof
          WHERE proof.purchase_order_id = po.id AND proof.filename = po.payment_proof
        )
    `).run();
  }

  ensureCustomerTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        phone TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        privacy_consent_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS customer_sessions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id, expires_at);
    `);
  }
  ensureProductPresentation() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const existingBuilds = [
      [
        "prod_1",
        "RK-01",
        "The Silverline",
        "Suzuki Thunder",
        "CafeRacer_motorcycle.jpg",
        "/images/catalog/rk-01-the-silverline.jpg",
      ],
      [
        "prod_2",
        "RK-02",
        "The Longway",
        "Yamaha Scorpio",
        "Chooper_motorcycle.jpg",
        "/images/catalog/rk-02-the-longway.jpg",
      ],
      [
        "prod_3",
        "RK-03",
        "The Gentleman",
        "Honda Tiger",
        "britishstyle_motorcycle.jpg",
        "/images/catalog/rk-03-the-gentleman.jpg",
      ],
    ];
    const updateBuild = this.db.prepare(
      "UPDATE products SET build_code = COALESCE(build_code, ?), build_name = COALESCE(build_name, ?), basis = COALESCE(basis, ?), image_alt = COALESCE(image_alt, name) WHERE id = ?",
    );
    const updateLegacyImage = this.db.prepare(
      "UPDATE products SET image = ? WHERE id = ? AND image = ?",
    );
    const seedProducts = new Map(
      JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
        .products.map((product) => [product.id, product]),
    );
    for (const [id, code, name, basis, legacyImage, catalogImage] of existingBuilds) {
      updateBuild.run(code, name, basis, id);
      updateLegacyImage.run(catalogImage, id, legacyImage);
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const migrationName = "seeded-direct-purchases-v1";
      const migrationExists = this.db.prepare(
        "SELECT 1 FROM schema_migrations WHERE name = ?",
      );
      if (!migrationExists.get(migrationName)) {
        const enableLegacyPurchase = this.db.prepare(
          "UPDATE products SET purchase_type = 'made_to_order', purchase_enabled = 1, purchase_specs = ? WHERE id = ? AND purchase_enabled = 0 AND purchase_type = 'consultation_only' AND TRIM(COALESCE(purchase_specs, '')) = ''",
        );
        for (const [id] of existingBuilds) {
          const seedProduct = seedProducts.get(id);
          if (seedProduct?.purchaseType === "made_to_order" && seedProduct.purchaseEnabled) {
            enableLegacyPurchase.run(seedProduct.fixedSpecifications || "", id);
          }
        }
        this.db.prepare(
          "INSERT INTO schema_migrations (name) VALUES (?)",
        ).run(migrationName);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  ensureOrderColumns() {
    const columns = new Set(
      this.db
        .prepare("PRAGMA table_info(orders)")
        .all()
        .map((column) => column.name),
    );

    const additions = {
      reference_images: "TEXT NOT NULL DEFAULT '[]'",
      donor_motor: "TEXT NOT NULL DEFAULT ''",
      reference_product_id: "TEXT",
      reference_product_name: "TEXT",
      reference_build_name: "TEXT",
      reference_build_code: "TEXT",
      reference_category: "TEXT",
      reference_basis: "TEXT",
      reference_price: "INTEGER",
      reference_motor_id: "TEXT",
      reference_motor_name: "TEXT",
      reference_motor_build_name: "TEXT",
      reference_motor_basis: "TEXT",
      reference_motor_image: "TEXT",
      reference_motor_selected: "INTEGER NOT NULL DEFAULT 0",
      consent: "INTEGER NOT NULL DEFAULT 0",
    };

    for (const [name, type] of Object.entries(additions)) {
      if (!columns.has(name)) {
        this.db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
      }
    }
  }

  ensureAdminColumns() {
    const columns = new Set(
      this.db
        .prepare("PRAGMA table_info(admins)")
        .all()
        .map((column) => column.name),
    );

    if (!columns.has("is_active")) {
      this.db.exec("ALTER TABLE admins ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
    }
    if (!columns.has("phone")) {
      this.db.exec("ALTER TABLE admins ADD COLUMN phone TEXT");
    }
    if (!columns.has("auth_version")) {
      this.db.exec("ALTER TABLE admins ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0");
    }
  }

  ensurePasswordResetTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_otps (
        id TEXT PRIMARY KEY,
        account_type TEXT NOT NULL CHECK (account_type IN ('admin', 'customer')),
        account_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        consumed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_password_reset_lookup
        ON password_reset_otps(account_type, account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_password_reset_phone
        ON password_reset_otps(phone, created_at DESC);
    `);
  }

  seedInitialData() {
    const seedData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    // Seed Settings
    const existingSettings = this.db
      .prepare("SELECT COUNT(*) AS count FROM settings")
      .get();
    if (existingSettings.count === 0) {
      const insertSetting = this.db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?)",
      );
      for (const [key, value] of Object.entries(seedData.settings)) {
        insertSetting.run(key, String(value));
      }
    }

    // Seed Categories
    const existingCategories = this.db
      .prepare("SELECT COUNT(*) AS count FROM categories")
      .get();
    if (existingCategories.count === 0) {
      const insertCat = this.db.prepare(
        "INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)",
      );
      for (const category of seedData.categories) {
        insertCat.run(category.id, category.name, category.slug);
      }
    }

    // Seed Products
    const existingProducts = this.db
      .prepare("SELECT COUNT(*) AS count FROM products")
      .get();
    if (existingProducts.count === 0) {
      const insertProduct = this.db.prepare(`
        INSERT INTO products (
          id, name, category_id, price, stock_status, description, image,
          purchase_type, purchase_enabled, purchase_specs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const product of seedData.products) {
        const stockStatus =
          Number(product.stockStatus) > 0 ? "Tersedia" : "Habis";
        insertProduct.run(
          product.id,
          product.name,
          product.categoryId,
          product.price,
          stockStatus,
          product.description,
          product.image,
          product.purchaseType || "consultation_only",
          product.purchaseEnabled ? 1 : 0,
          product.fixedSpecifications || "",
        );
      }
    }
  }

  // --- Settings SQL Operations ---
  getSettings() {
    const rows = this.db.prepare("SELECT key, value FROM settings").all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  updateSettings(newSettings) {
    const upsert = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    for (const [key, val] of Object.entries(newSettings)) {
      upsert.run(key, String(val));
    }
    return this.getSettings();
  }

  // --- Admin SQL Operations ---
  getAdmin() {
    return this.db
      .prepare(
        `SELECT id, name, email, password, phone,
          is_active AS isActive, auth_version AS authVersion
        FROM admins LIMIT 1`,
      )
      .get();
  }

  getAdminById(id) {
    return this.db
      .prepare(
        `SELECT id, name, email, phone, is_active AS isActive,
          auth_version AS authVersion
        FROM admins WHERE id = ?`,
      )
      .get(id);
  }

  getAdminByEmail(email) {
    return this.db.prepare(`
      SELECT id FROM admins WHERE email = ? COLLATE NOCASE LIMIT 1
    `).get(email);
  }

  getCustomerById(id) {
    return this.db.prepare(`
      SELECT id, full_name AS fullName, email, phone,
        password_hash AS passwordHash, is_active AS isActive,
        created_at AS createdAt, updated_at AS updatedAt
      FROM customers WHERE id = ?
    `).get(id);
  }

  getCustomerByEmail(email) {
    return this.db.prepare(`
      SELECT id, full_name AS fullName, email, phone,
        password_hash AS passwordHash, is_active AS isActive,
        created_at AS createdAt, updated_at AS updatedAt
      FROM customers WHERE email = ? COLLATE NOCASE
    `).get(email);
  }

  getActiveCustomersByPhone(phone) {
    return this.db.prepare(`
      SELECT id, full_name AS fullName, email, phone,
        password_hash AS passwordHash, is_active AS isActive,
        created_at AS createdAt, updated_at AS updatedAt
      FROM customers WHERE phone = ? AND is_active = 1
    `).all(phone);
  }

  getPasswordResetForPhone(phone, since) {
    return this.db.prepare(`
      SELECT id FROM password_reset_otps
      WHERE phone = ? AND datetime(created_at) >= datetime(?)
      ORDER BY created_at DESC LIMIT 1
    `).get(phone, since);
  }

  createPasswordResetOtp({ id, accountType, accountId, phone, codeHash, expiresAt }) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        UPDATE password_reset_otps SET consumed_at = CURRENT_TIMESTAMP
        WHERE account_type = ? AND account_id = ? AND consumed_at IS NULL
      `).run(accountType, accountId);
      this.db.prepare(`
        INSERT INTO password_reset_otps
          (id, account_type, account_id, phone, code_hash, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, accountType, accountId, phone, codeHash, expiresAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  invalidatePasswordResetOtp(id) {
    this.db.prepare(`
      UPDATE password_reset_otps SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND consumed_at IS NULL
    `).run(id);
  }

  completePasswordReset({ accountType, accountId, phone, codeHash, passwordHash }) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const otp = this.db.prepare(`
        SELECT id, code_hash AS codeHash, expires_at AS expiresAt,
          attempts, consumed_at AS consumedAt
        FROM password_reset_otps
        WHERE account_type = ? AND account_id = ? AND phone = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(accountType, accountId, phone);

      if (!otp || otp.consumedAt) {
        this.db.exec("COMMIT");
        return "invalid";
      }

      if (Date.parse(otp.expiresAt) <= Date.now()) {
        this.db.prepare(`
          UPDATE password_reset_otps SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(otp.id);
        this.db.exec("COMMIT");
        return "expired";
      }

      if (otp.attempts >= 5) {
        this.db.prepare(`
          UPDATE password_reset_otps SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(otp.id);
        this.db.exec("COMMIT");
        return "locked";
      }

      const provided = Buffer.from(codeHash, "hex");
      const expected = Buffer.from(otp.codeHash, "hex");
      const matches = provided.length === expected.length
        && timingSafeEqual(provided, expected);

      if (!matches) {
        const attempts = otp.attempts + 1;
        this.db.prepare(`
          UPDATE password_reset_otps SET attempts = ?,
            consumed_at = CASE WHEN ? >= 5 THEN CURRENT_TIMESTAMP ELSE consumed_at END
          WHERE id = ?
        `).run(attempts, attempts, otp.id);
        this.db.exec("COMMIT");
        return attempts >= 5 ? "locked" : "invalid";
      }

      const used = this.db.prepare(`
        UPDATE password_reset_otps SET consumed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND consumed_at IS NULL
      `).run(otp.id);
      if (!used.changes) {
        this.db.exec("COMMIT");
        return "invalid";
      }

      if (accountType === "admin") {
        const updated = this.db.prepare(`
          UPDATE admins SET password = ?, auth_version = auth_version + 1
          WHERE id = ? AND phone = ? AND is_active = 1
        `).run(passwordHash, accountId, phone);
        if (!updated.changes) {
          this.db.exec("ROLLBACK");
          return "invalid";
        }
      } else {
        const updated = this.db.prepare(`
          UPDATE customers SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND phone = ? AND is_active = 1
        `).run(passwordHash, accountId, phone);
        if (!updated.changes) {
          this.db.exec("ROLLBACK");
          return "invalid";
        }
        this.db.prepare(`
          UPDATE customer_sessions SET revoked_at = CURRENT_TIMESTAMP
          WHERE customer_id = ? AND revoked_at IS NULL
        `).run(accountId);
      }

      this.db.exec("COMMIT");
      return "success";
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  createCustomer({ id, fullName, email, phone, passwordHash }) {
    this.db.prepare(`
      INSERT INTO customers (id, full_name, email, phone, password_hash, privacy_consent_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, fullName, email, phone, passwordHash);
    return this.getCustomerById(id);
  }

  updateCustomerProfile(id, { fullName, email, phone }) {
    const result = this.db.prepare(`
      UPDATE customers SET full_name = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_active = 1
    `).run(fullName, email, phone, id);
    return result.changes ? this.getCustomerById(id) : null;
  }

  getCustomerPublicProfile(id) {
    const customer = this.getCustomerById(id);
    if (!customer || customer.isActive !== 1) return null;
    const { passwordHash, isActive, ...profile } = customer;
    return profile;
  }

  createCustomerSession({ id, customerId, expiresAt }) {
    this.db.prepare(`
      INSERT INTO customer_sessions (id, customer_id, expires_at)
      VALUES (?, ?, ?)
    `).run(id, customerId, expiresAt);
  }

  getCustomerSession(id, customerId) {
    return this.db.prepare(`
      SELECT id, customer_id AS customerId, expires_at AS expiresAt, revoked_at AS revokedAt
      FROM customer_sessions
      WHERE id = ? AND customer_id = ? AND datetime(expires_at) > CURRENT_TIMESTAMP
    `).get(id, customerId);
  }

  revokeCustomerSession(id, customerId) {
    return this.db.prepare(`
      UPDATE customer_sessions SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = ? AND customer_id = ? AND revoked_at IS NULL
    `).run(id, customerId).changes > 0;
  }

  bootstrapAdmin({ id, name, email, password, phone }) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const admins = this.db
        .prepare(
          `SELECT id, email, password, name, phone, is_active AS isActive
          FROM admins`,
        )
        .all();

      if (admins.length > 1) {
        throw new Error(
          "More than one admin account was found; clean up the accounts before running setup.",
        );
      }

      const existingAdmin = admins[0];
      if (
        existingAdmin &&
        existingAdmin.email.toLowerCase() !== normalizedEmail
      ) {
        throw new Error(
          "An admin account already exists with a different email. Use that account's email to update its credentials.",
        );
      }

      let result;
      if (!existingAdmin) {
        this.db
          .prepare(
            `INSERT INTO admins (id, name, email, password, phone, is_active)
            VALUES (?, ?, ?, ?, ?, 1)`,
          )
          .run(id, name, normalizedEmail, bcrypt.hashSync(password, 10), phone || null);
        result = "created";
      } else {
        const passwordMatches = bcrypt.compareSync(
          password,
          existingAdmin.password,
        );
        if (
          !passwordMatches ||
          existingAdmin.name !== name ||
          existingAdmin.isActive !== 1 ||
          (phone && existingAdmin.phone !== phone)
        ) {
          const passwordHash = passwordMatches
            ? existingAdmin.password
            : bcrypt.hashSync(password, 10);
          this.db
            .prepare(
              `UPDATE admins SET name = ?, email = ?, password = ?, phone = COALESCE(?, phone),
                is_active = 1, auth_version = auth_version + 1 WHERE id = ?`,
            )
            .run(name, normalizedEmail, passwordHash, phone || null, existingAdmin.id);
          result = "updated";
        } else {
          result = "unchanged";
        }
      }

      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  // --- Category SQL Operations ---
  getCategories() {
    // Relational SQL query with LEFT JOIN and COUNT
    return this.db
      .prepare(
        `
      SELECT 
        c.id, 
        c.name, 
        c.slug, 
        c.created_at AS createdAt,
        COUNT(p.id) AS productCount
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      GROUP BY c.id
      ORDER BY c.created_at ASC
    `,
      )
      .all();
  }

  getCategoryById(id) {
    return this.db
      .prepare("SELECT id, name, slug FROM categories WHERE id = ?")
      .get(id);
  }

  addCategory(name) {
    const id = `cat-${Date.now()}`;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    this.db
      .prepare("INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)")
      .run(id, name, slug);
    return { id, name, slug, productCount: 0 };
  }

  updateCategory(id, name) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const res = this.db
      .prepare("UPDATE categories SET name = ?, slug = ? WHERE id = ?")
      .run(name, slug, id);
    if (res.changes === 0) return null;
    return { id, name, slug };
  }

  deleteCategory(id) {
    const res = this.db.prepare("DELETE FROM categories WHERE id = ?").run(id);
    return res.changes > 0;
  }

  // --- Product SQL Operations ---
  getProducts(filters = {}) {
    let sql = `
      SELECT 
        p.id, 
        p.name, 
        p.category_id AS categoryId, 
        c.name AS categoryName, 
        p.price, 
        p.stock_status AS stockStatus, 
        p.description, 
        p.image, 
        p.basis,
        p.build_name AS buildName,
        p.build_code AS buildCode,
        p.image_alt AS imageAlt,
        p.engine,
        p.transmission,
        p.cockpit,
        p.finishing,
        p.spec_notes AS specNotes,
        p.purchase_type AS purchaseType,
        p.purchase_enabled AS purchaseEnabled,
        p.purchase_specs AS fixedSpecifications,
        p.estimated_build_days AS estimatedBuildDays,
        p.purchase_stock_quantity AS purchaseStockQuantity,
        CASE
          WHEN p.purchase_enabled = 1
            AND p.purchase_type IN ('ready_stock', 'made_to_order')
            AND p.price > 0
            AND TRIM(COALESCE(p.purchase_specs, '')) != ''
            AND TRIM(COALESCE(p.basis, '')) != ''
            AND (
              p.purchase_type = 'made_to_order'
              OR (
                p.stock_status = 'Tersedia'
                AND p.purchase_stock_quantity > (
                  SELECT COUNT(*) FROM purchase_orders po
                  WHERE po.product_id = p.id
                    AND po.approval_status IN ('pending_approval', 'approved')
                    AND po.payment_status IN ('pending_payment', 'waiting_verification')
                )
              )
            )
          THEN 1 ELSE 0
        END AS canPurchase,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.categoryId) {
      sql += " AND p.category_id = ?";
      params.push(filters.categoryId);
    }

    if (filters.stockStatus) {
      sql += " AND p.stock_status = ?";
      params.push(filters.stockStatus);
    }

    if (filters.search) {
      sql += " AND (LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ?)";
      const queryPattern = `%${filters.search.toLowerCase()}%`;
      params.push(queryPattern, queryPattern);
    }

    sql += " ORDER BY p.created_at DESC";

    return this.db.prepare(sql).all(...params);
  }

  getProductById(id) {
    return this.db
      .prepare(
        `
      SELECT 
        p.id, 
        p.name, 
        p.category_id AS categoryId, 
        c.name AS categoryName, 
        p.price, 
        p.stock_status AS stockStatus, 
        p.description, 
        p.image, 
        p.basis,
        p.build_name AS buildName,
        p.build_code AS buildCode,
        p.image_alt AS imageAlt,
        p.engine,
        p.transmission,
        p.cockpit,
        p.finishing,
        p.spec_notes AS specNotes,
        p.purchase_type AS purchaseType,
        p.purchase_enabled AS purchaseEnabled,
        p.purchase_specs AS fixedSpecifications,
        p.estimated_build_days AS estimatedBuildDays,
        p.purchase_stock_quantity AS purchaseStockQuantity,
        CASE
          WHEN p.purchase_enabled = 1
            AND p.purchase_type IN ('ready_stock', 'made_to_order')
            AND p.price > 0
            AND TRIM(COALESCE(p.purchase_specs, '')) != ''
            AND TRIM(COALESCE(p.basis, '')) != ''
            AND (
              p.purchase_type = 'made_to_order'
              OR (
                p.stock_status = 'Tersedia'
                AND p.purchase_stock_quantity > (
                  SELECT COUNT(*) FROM purchase_orders po
                  WHERE po.product_id = p.id
                    AND po.approval_status IN ('pending_approval', 'approved')
                    AND po.payment_status IN ('pending_payment', 'waiting_verification')
                )
              )
            )
          THEN 1 ELSE 0
        END AS canPurchase,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `,
      )
      .get(id);
  }

  addProduct(productData) {
    const id = `prod_${randomUUID()}`;
    const buildCodes = this.db
      .prepare("SELECT build_code AS buildCode FROM products WHERE build_code IS NOT NULL")
      .all()
      .map((product) => Number(product.buildCode.match(/^RK-(\d+)$/)?.[1]) || 0);
    const buildCode = productData.buildCode || `RK-${String(Math.max(0, ...buildCodes) + 1).padStart(2, "0")}`;
    const price = Number(productData.price);
    const stockStatus = productData.stockStatus || "Tersedia";
    const description = productData.description;
    const image = productData.image;

    this.db
      .prepare(
        `
      INSERT INTO products (
        id, name, category_id, price, stock_status, description, image,
        basis, build_name, build_code, engine, transmission, cockpit, finishing,
        spec_notes, image_alt
        , purchase_type, purchase_enabled, purchase_specs, estimated_build_days,
        purchase_stock_quantity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        id,
        productData.name,
        productData.categoryId,
        price,
        stockStatus,
        description,
        image,
        productData.basis,
        productData.buildName || null,
        buildCode,
        productData.engine || null,
        productData.transmission || null,
        productData.cockpit || null,
        productData.finishing || null,
        productData.specNotes || null,
        productData.imageAlt,
        productData.purchaseType || "consultation_only",
        productData.purchaseEnabled ? 1 : 0,
        productData.fixedSpecifications || "",
        productData.estimatedBuildDays || null,
        productData.purchaseStockQuantity || 0,
      );

    return this.getProductById(id);
  }

  updateProduct(id, productData) {
    const current = this.getProductById(id);
    if (!current) return null;

    const name =
      productData.name !== undefined ? productData.name : current.name;
    const categoryId =
      productData.categoryId !== undefined
        ? productData.categoryId
        : current.categoryId;
    const price =
      productData.price !== undefined
        ? Number(productData.price)
        : current.price;
    const stockStatus =
      productData.stockStatus !== undefined
        ? productData.stockStatus
        : current.stockStatus;
    const description =
      productData.description !== undefined
        ? productData.description
        : current.description;
    const image =
      productData.image !== undefined ? productData.image : current.image;
    const basis =
      productData.basis !== undefined ? productData.basis : current.basis;
    const buildName =
      productData.buildName !== undefined ? productData.buildName : current.buildName;
    const buildCode =
      productData.buildCode !== undefined ? productData.buildCode : current.buildCode;
    const engine =
      productData.engine !== undefined ? productData.engine : current.engine;
    const transmission =
      productData.transmission !== undefined
        ? productData.transmission
        : current.transmission;
    const cockpit =
      productData.cockpit !== undefined ? productData.cockpit : current.cockpit;
    const finishing =
      productData.finishing !== undefined ? productData.finishing : current.finishing;
    const specNotes =
      productData.specNotes !== undefined ? productData.specNotes : current.specNotes;
    const imageAlt =
      productData.imageAlt !== undefined ? productData.imageAlt : current.imageAlt;
    const purchaseType =
      productData.purchaseType !== undefined ? productData.purchaseType : current.purchaseType;
    const purchaseEnabled =
      productData.purchaseEnabled !== undefined ? productData.purchaseEnabled : current.purchaseEnabled;
    const fixedSpecifications =
      productData.fixedSpecifications !== undefined
        ? productData.fixedSpecifications
        : current.fixedSpecifications;
    const estimatedBuildDays =
      productData.estimatedBuildDays !== undefined
        ? productData.estimatedBuildDays
        : current.estimatedBuildDays;
    const purchaseStockQuantity =
      productData.purchaseStockQuantity !== undefined
        ? productData.purchaseStockQuantity
        : current.purchaseStockQuantity;

    this.db
      .prepare(
        `
      UPDATE products 
      SET name = ?, category_id = ?, price = ?, stock_status = ?, description = ?, image = ?,
          basis = ?, build_name = ?, build_code = ?, engine = ?, transmission = ?,
          cockpit = ?, finishing = ?, spec_notes = ?, image_alt = ?,
          purchase_type = ?, purchase_enabled = ?, purchase_specs = ?,
          estimated_build_days = ?, purchase_stock_quantity = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      )
      .run(
        name, categoryId, price, stockStatus, description, image, basis,
        buildName, buildCode, engine, transmission, cockpit, finishing, specNotes,
        imageAlt, purchaseType, purchaseEnabled ? 1 : 0, fixedSpecifications,
        estimatedBuildDays || null, purchaseStockQuantity || 0, id,
      );

    return this.getProductById(id);
  }

  toggleStock(id) {
    const product = this.getProductById(id);
    if (!product) return null;

    const newStock = product.stockStatus === "Tersedia" ? "Habis" : "Tersedia";
    this.db
      .prepare(
        `
      UPDATE products 
      SET stock_status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `,
      )
      .run(newStock, id);

    return this.getProductById(id);
  }

  deleteProduct(id) {
    const res = this.db.prepare("DELETE FROM products WHERE id = ?").run(id);
    return res.changes > 0;
  }

  getPurchasableProduct(id) {
    const product = this.getProductById(id);
    return product?.canPurchase === 1 && Number.isSafeInteger(product.price)
      ? product
      : null;
  }

  isPurchaseImageInUse(image) {
    return Boolean(this.db.prepare(
      "SELECT 1 FROM purchase_orders WHERE image_snapshot = ? LIMIT 1",
    ).get(image));
  }

  createPurchaseOrder(order) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db.prepare(`
        SELECT id, request_hash AS requestHash, access_token_hash AS accessTokenHash
        FROM purchase_orders WHERE idempotency_key = ?
      `).get(order.idempotencyKey);
      if (existing) {
        if (
          existing.requestHash !== order.requestHash
          || existing.accessTokenHash !== order.accessTokenHash
        ) {
          const error = new Error("This request key has already been used for a different order.");
          error.code = "IDEMPOTENCY_CONFLICT";
          throw error;
        }
        this.db.exec("COMMIT");
        return { order: this.getPurchaseOrderById(existing.id), duplicate: true };
      }

      const product = this.getPurchasableProduct(order.productId);
      if (!product) {
        const error = new Error("The product is not enabled for direct purchase or there is insufficient stock.");
        error.code = "PRODUCT_UNAVAILABLE";
        throw error;
      }

      const specifications = getPurchaseSpecifications(product.fixedSpecifications);
      const id = randomUUID();
      const dateCode = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const orderNumber = `RM-${dateCode}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const isDelivery = order.shippingMethod === "delivery";
      const totalAmount = product.price;
      this.db.prepare(`
        INSERT INTO purchase_orders (
          id, order_number, idempotency_key, request_hash, access_token_hash, customer_id,
          product_id, product_name, build_name, build_code, purchase_type, basis,
          category_name, image_snapshot, description_snapshot, specifications, price_snapshot, shipping_method,
          delivery_address, shipping_cost, total_amount, customer_name, phone,
          email, city, payment_method, payment_status, approval_status, order_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'pending_approval', ?)
      `).run(
        id,
        orderNumber,
        order.idempotencyKey,
        order.requestHash,
        order.accessTokenHash,
        order.customerId || null,
        product.id,
        product.name,
        product.buildName || product.name,
        product.buildCode || "",
        product.purchaseType,
        product.basis,
        product.categoryName,
        product.image || "",
        product.description || "",
        JSON.stringify(specifications),
        product.price,
        order.shippingMethod,
        order.deliveryAddress || "",
        isDelivery ? null : 0,
        totalAmount,
        order.customerName,
        order.phone,
        order.email || "",
        order.city,
        order.paymentMethod,
        isDelivery ? "awaiting_shipping_quote" : "awaiting_payment",
      );
      this.db.prepare(`
        INSERT INTO purchase_order_events (
          id, purchase_order_id, event_type, label, actor_type, actor_id
        ) VALUES (?, ?, 'order_created', 'Order created', ?, ?)
      `).run(randomUUID(), id, order.customerId ? "customer" : "system", order.customerId || null);
      this.db.exec("COMMIT");
      return { order: this.getPurchaseOrderById(id), duplicate: false };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getPurchaseOrderById(id) {
    return this.db.prepare(`
      SELECT id, order_number AS orderNumber, product_id AS productId,
        customer_id AS customerId,
        product_name AS productName, build_name AS buildName,
        build_code AS buildCode, purchase_type AS purchaseType, basis,
        category_name AS categoryName, image_snapshot AS imageSnapshot,
        specifications,
        price_snapshot AS price, shipping_method AS shippingMethod,
        delivery_address AS deliveryAddress, shipping_cost AS shippingCost,
        total_amount AS totalAmount, customer_name AS customerName, phone,
        email, city, payment_method AS paymentMethod,
        payment_status AS paymentStatus, approval_status AS approvalStatus,
        approval_rejection_reason AS approvalRejectionReason,
        approved_at AS approvedAt, description_snapshot AS descriptionSnapshot,
        CASE
          WHEN order_status = 'ready_to_ship'
            AND EXISTS (SELECT 1 FROM purchase_order_events WHERE purchase_order_id = purchase_orders.id AND event_type = 'order_arrived_destination')
          THEN 'delivered'
          ELSE order_status
        END AS orderStatus,
        admin_hidden_at AS adminHiddenAt,
        payment_proof AS paymentProof, created_at AS createdAt,
        updated_at AS updatedAt,
        (
          SELECT created_at FROM purchase_order_events
          WHERE purchase_order_id = purchase_orders.id
            AND event_type = 'customer_confirmed_received'
            AND julianday(created_at) >= julianday(CASE
              WHEN purchase_orders.shipping_method = 'delivery' THEN (
                SELECT arrived.created_at FROM purchase_order_events arrived
                WHERE arrived.purchase_order_id = purchase_orders.id
                  AND arrived.event_type = 'order_arrived_destination'
                ORDER BY arrived.created_at DESC, arrived.rowid DESC LIMIT 1
              )
              WHEN purchase_orders.order_status = 'ready_for_pickup' THEN (
                SELECT ready.created_at FROM purchase_order_events ready
                WHERE ready.purchase_order_id = purchase_orders.id
                  AND ready.event_type = 'order_ready_for_pickup'
                ORDER BY ready.created_at DESC, ready.rowid DESC LIMIT 1
              )
              ELSE NULL
            END)
          ORDER BY created_at DESC, rowid DESC
          LIMIT 1
        ) AS customerReceivedAt,
        (
          SELECT created_at FROM purchase_order_events
          WHERE purchase_order_id = purchase_orders.id
            AND event_type = 'order_arrived_destination'
          ORDER BY created_at DESC, rowid DESC
          LIMIT 1
        ) AS deliveredAt,
        (
          SELECT created_at FROM purchase_order_events
          WHERE purchase_order_id = purchase_orders.id
            AND event_type = CASE
              WHEN purchase_orders.shipping_method = 'delivery' THEN 'order_arrived_destination'
              WHEN purchase_orders.order_status = 'ready_for_pickup' THEN 'order_ready_for_pickup'
              ELSE ''
            END
          ORDER BY created_at DESC, rowid DESC
          LIMIT 1
        ) AS readyAt,
        CASE WHEN order_status IN ('ready_for_pickup', 'ready_to_ship') AND (
          EXISTS (
            SELECT 1 FROM purchase_order_events
            WHERE purchase_order_id = purchase_orders.id
              AND event_type = 'customer_confirmed_received'
              AND julianday(created_at) >= julianday(CASE
                WHEN purchase_orders.shipping_method = 'delivery' THEN (
                  SELECT arrived.created_at FROM purchase_order_events arrived
                  WHERE arrived.purchase_order_id = purchase_orders.id
                    AND arrived.event_type = 'order_arrived_destination'
                  ORDER BY arrived.created_at DESC, arrived.rowid DESC LIMIT 1
                )
                WHEN purchase_orders.order_status = 'ready_for_pickup' THEN (
                  SELECT ready.created_at FROM purchase_order_events ready
                  WHERE ready.purchase_order_id = purchase_orders.id
                    AND ready.event_type = 'order_ready_for_pickup'
                  ORDER BY ready.created_at DESC, ready.rowid DESC LIMIT 1
                )
                ELSE NULL
              END)
          )
          OR EXISTS (
            SELECT 1 FROM purchase_order_events
            WHERE purchase_order_id = purchase_orders.id
              AND event_type = CASE
                WHEN purchase_orders.shipping_method = 'delivery' THEN 'order_arrived_destination'
                WHEN purchase_orders.order_status = 'ready_for_pickup' THEN 'order_ready_for_pickup'
                ELSE ''
              END
              AND julianday('now') >= julianday(created_at) + 3
          )
        ) THEN 1 ELSE 0 END AS canAdminComplete
      FROM purchase_orders WHERE id = ?
    `).get(id);
  }

  getCustomerPurchaseOrder(id, accessToken) {
    const order = this.getPurchaseOrderById(id);
    if (!order) return null;
    const row = this.db.prepare(
      "SELECT access_token_hash AS tokenHash FROM purchase_orders WHERE id = ?",
    ).get(id);
    const expected = Buffer.from(row.tokenHash, "hex");
    const actual = Buffer.from(createHash("sha256").update(accessToken).digest("hex"), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const { paymentProof, customerId, ...publicOrder } = order;
    publicOrder.cancelledByAdmin = Boolean(order.adminHiddenAt && order.orderStatus === "cancelled");
    delete publicOrder.adminHiddenAt;
    return {
      ...publicOrder,
      isClaimed: Boolean(customerId),
      hasPaymentProof: Boolean(paymentProof),
      paymentProofHistory: this.getPurchasePaymentProofHistory(id).map(({ id: proofId, createdAt }) => ({
        id: proofId,
        createdAt,
      })),
      timeline: this.getPurchaseOrderEvents(id),
    };
  }

  getPurchaseOrderEvents(id) {
    return this.db.prepare(`
      SELECT id, event_type AS eventType, label, details,
        created_at AS createdAt
      FROM purchase_order_events
      WHERE purchase_order_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(id);
  }

  getPurchasePaymentProofHistory(id) {
    return this.db.prepare(`
      SELECT id, filename, created_at AS createdAt
      FROM purchase_payment_proofs
      WHERE purchase_order_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(id);
  }

  getCustomerPurchaseOrders(customerId, { status = "", sort = "desc", page = 1, pageSize = 10 } = {}) {
    const statusConditions = {
      pending_approval: "approval_status = 'pending_approval'",
      waiting_shipping_quote: "approval_status = 'pending_approval' AND order_status = 'awaiting_shipping_quote'",
      pending_payment: "approval_status = 'approved' AND payment_status = 'pending_payment'",
      waiting_verification: "payment_status = 'waiting_verification'",
      rejected: "approval_status = 'rejected'",
      payment_rejected: "approval_status != 'rejected' AND payment_status = 'rejected'",
      paid: "payment_status = 'paid'",
      expired: "payment_status = 'expired'",
      processing: "payment_status = 'paid' AND order_status = 'processing'",
      ready: "payment_status = 'paid' AND (order_status = 'ready_for_pickup' OR (order_status = 'ready_to_ship' AND NOT EXISTS (SELECT 1 FROM purchase_order_events WHERE purchase_order_id = purchase_orders.id AND event_type = 'order_arrived_destination')))",
      delivered: "payment_status = 'paid' AND order_status = 'ready_to_ship' AND EXISTS (SELECT 1 FROM purchase_order_events WHERE purchase_order_id = purchase_orders.id AND event_type = 'order_arrived_destination')",
      completed: "payment_status = 'paid' AND order_status = 'completed'",
      cancelled: "order_status = 'cancelled'",
    };
    const whereStatus = status ? `AND (${statusConditions[status] || "0 = 1"})` : "";
    const total = this.db.prepare(`
      SELECT COUNT(*) AS count FROM purchase_orders
      WHERE customer_id = ? AND customer_hidden_at IS NULL ${whereStatus}
    `).get(customerId).count;
    const direction = sort === "asc" ? "ASC" : "DESC";
    const data = this.db.prepare(`
      SELECT id, order_number AS orderNumber, build_name AS buildName,
        product_name AS productName, basis, image_snapshot AS imageSnapshot,
        price_snapshot AS price, total_amount AS totalAmount,
        payment_method AS paymentMethod, payment_status AS paymentStatus,
        approval_status AS approvalStatus,
        CASE
          WHEN order_status = 'ready_to_ship'
            AND EXISTS (SELECT 1 FROM purchase_order_events WHERE purchase_order_id = purchase_orders.id AND event_type = 'order_arrived_destination')
          THEN 'delivered'
          ELSE order_status
        END AS orderStatus,
        (admin_hidden_at IS NOT NULL AND order_status = 'cancelled') AS cancelledByAdmin,
        (
          SELECT created_at FROM purchase_order_events
          WHERE purchase_order_id = purchase_orders.id
            AND event_type = 'customer_confirmed_received'
            AND julianday(created_at) >= julianday(CASE
              WHEN purchase_orders.shipping_method = 'delivery' THEN (
                SELECT arrived.created_at FROM purchase_order_events arrived
                WHERE arrived.purchase_order_id = purchase_orders.id
                  AND arrived.event_type = 'order_arrived_destination'
                ORDER BY arrived.created_at DESC, arrived.rowid DESC LIMIT 1
              )
              WHEN purchase_orders.order_status = 'ready_for_pickup' THEN (
                SELECT ready.created_at FROM purchase_order_events ready
                WHERE ready.purchase_order_id = purchase_orders.id
                  AND ready.event_type = 'order_ready_for_pickup'
                ORDER BY ready.created_at DESC, ready.rowid DESC LIMIT 1
              )
              ELSE NULL
            END)
          ORDER BY created_at DESC, rowid DESC
          LIMIT 1
        ) AS customerReceivedAt,
        CASE
          WHEN admin_hidden_at IS NOT NULL AND order_status = 'cancelled' THEN 'cancelled'
          WHEN approval_status = 'rejected' THEN 'rejected'
          WHEN order_status = 'cancelled' THEN 'cancelled'
          WHEN approval_status = 'pending_approval' AND order_status = 'awaiting_shipping_quote' THEN 'waiting_shipping_quote'
          WHEN approval_status = 'pending_approval' THEN 'pending_approval'
          WHEN approval_status = 'rejected' THEN 'rejected'
          WHEN payment_status = 'waiting_verification' THEN 'waiting_verification'
          WHEN payment_status = 'rejected' THEN 'payment_rejected'
          WHEN payment_status = 'expired' THEN 'expired'
          WHEN payment_status = 'paid' AND order_status = 'processing' THEN 'processing'
          WHEN payment_status = 'paid' AND order_status = 'ready_to_ship'
            AND EXISTS (SELECT 1 FROM purchase_order_events WHERE purchase_order_id = purchase_orders.id AND event_type = 'order_arrived_destination') THEN 'delivered'
          WHEN payment_status = 'paid' AND order_status IN ('ready_for_pickup', 'ready_to_ship') THEN 'ready'
          WHEN payment_status = 'paid' AND order_status = 'completed' THEN 'completed'
          ELSE 'pending_payment'
        END AS status,
        created_at AS createdAt
      FROM purchase_orders
      WHERE customer_id = ? AND customer_hidden_at IS NULL ${whereStatus}
      ORDER BY created_at ${direction}, id ${direction}
      LIMIT ? OFFSET ?
    `).all(customerId, pageSize, (page - 1) * pageSize);
    return {
      data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  getCustomerPurchaseOrderById(customerId, id) {
    const visibleOrder = this.db.prepare(`
      SELECT 1 FROM purchase_orders
      WHERE id = ? AND customer_id = ? AND customer_hidden_at IS NULL
    `).get(id, customerId);
    if (!visibleOrder) return null;
    const order = this.getPurchaseOrderById(id);
    if (!order || order.customerId !== customerId) return null;
    const { paymentProof, ...safeOrder } = order;
    safeOrder.cancelledByAdmin = Boolean(order.adminHiddenAt && order.orderStatus === "cancelled");
    delete safeOrder.adminHiddenAt;
    delete safeOrder.customerId;
    return {
      ...safeOrder,
      hasPaymentProof: Boolean(paymentProof),
      paymentProofHistory: this.getPurchasePaymentProofHistory(id).map(({ id: proofId, filename, createdAt }) => ({
        id: proofId,
        createdAt,
        isCurrent: filename === paymentProof,
      })),
      timeline: this.getPurchaseOrderEvents(id),
    };
  }

  getCustomerPaymentProof(customerId, orderId, proofId = "") {
    const query = proofId
      ? `
        SELECT proof.filename FROM purchase_payment_proofs proof
        JOIN purchase_orders po ON po.id = proof.purchase_order_id
        WHERE po.id = ? AND po.customer_id = ? AND po.customer_hidden_at IS NULL AND proof.id = ?
      `
      : `
        SELECT po.payment_proof AS filename FROM purchase_orders po
        WHERE po.id = ? AND po.customer_id = ? AND po.customer_hidden_at IS NULL
      `;
    const row = proofId
      ? this.db.prepare(query).get(orderId, customerId, proofId)
      : this.db.prepare(query).get(orderId, customerId);
    return row?.filename || null;
  }

  hideCustomerPurchaseOrder(customerId, id) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const order = this.db.prepare(`
        SELECT order_status AS orderStatus FROM purchase_orders
        WHERE id = ? AND customer_id = ? AND customer_hidden_at IS NULL
      `).get(id, customerId);
      if (!order) {
        this.db.exec("ROLLBACK");
        return { found: false, deleted: false };
      }
      if (!["completed", "cancelled"].includes(order.orderStatus)) {
        this.db.exec("ROLLBACK");
        return { found: true, deleted: false };
      }
      const result = this.db.prepare(`
        UPDATE purchase_orders
        SET customer_hidden_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND customer_id = ? AND customer_hidden_at IS NULL
          AND order_status IN ('completed', 'cancelled')
      `).run(id, customerId);
      if (!result.changes) {
        this.db.exec("ROLLBACK");
        return { found: false, deleted: false };
      }
      this.db.exec("COMMIT");
      return { found: true, deleted: true };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  claimGuestPurchaseOrder(id, customerId) {
    const order = this.getPurchaseOrderById(id);
    const customer = this.getCustomerById(customerId);
    if (!order || !customer || order.customerId) return null;
    const normalizePhone = (value) => {
      const digits = String(value || "").replace(/\D/g, "");
      if (digits.startsWith("00")) return digits.slice(2);
      return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
    };
    if (
      order.email.trim().toLowerCase() !== customer.email.trim().toLowerCase()
      || normalizePhone(order.phone) !== normalizePhone(customer.phone)
    ) return null;
    const result = this.db.prepare(`
      UPDATE purchase_orders SET customer_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND customer_id IS NULL
    `).run(customerId, id);
    if (!result.changes) return null;
    this.recordPurchaseEvent(id, "guest_order_claimed", "Guest order linked to account", null, "customer", customerId);
    return this.getCustomerPurchaseOrderById(customerId, id);
  }

  recordPurchaseEvent(orderId, eventType, label, details = null, actorType = "system", actorId = null) {
    this.db.prepare(`
      INSERT INTO purchase_order_events (
        id, purchase_order_id, event_type, label, details, actor_type, actor_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), orderId, eventType, label, details, actorType, actorId);
  }

  confirmCustomerPurchaseReceived(customerId, id) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const order = this.getPurchaseOrderById(id);
      const customerVisibility = this.db.prepare(`
        SELECT customer_hidden_at AS customerHiddenAt FROM purchase_orders
        WHERE id = ? AND customer_id = ?
      `).get(id, customerId);
      if (
        !order
        || order.customerId !== customerId
        || !customerVisibility
        || customerVisibility.customerHiddenAt
        || order.paymentStatus !== "paid"
        || !(
          (order.shippingMethod === "delivery" && order.orderStatus === "delivered")
          || (order.shippingMethod === "pickup" && order.orderStatus === "ready_for_pickup")
        )
        || order.adminHiddenAt
      ) {
        this.db.exec("ROLLBACK");
        return null;
      }
      if (!order.customerReceivedAt) {
        this.recordPurchaseEvent(
          id,
          "customer_confirmed_received",
          "Customer confirmed motorcycle received",
          null,
          "customer",
          customerId,
        );
      }
      this.db.exec("COMMIT");
      return this.getCustomerPurchaseOrderById(customerId, id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getPurchaseOrders({ search = "", status = "", page = 1, pageSize = 10 }) {
    const conditions = ["admin_hidden_at IS NULL"];
    const params = [];
    if (search) {
      conditions.push("(order_number LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR product_name LIKE ?)");
      const query = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      params.push(query, query, query, query);
    }
    const statusConditions = {
      pending_approval: "approval_status = 'pending_approval' AND order_status != 'awaiting_shipping_quote'",
      pending_payment: "approval_status = 'approved' AND payment_status = 'pending_payment' AND order_status = 'awaiting_payment'",
      waiting_shipping_quote: "approval_status = 'pending_approval' AND order_status = 'awaiting_shipping_quote'",
      waiting_verification: "approval_status = 'approved' AND payment_status = 'waiting_verification'",
      payment_rejected: "approval_status = 'approved' AND payment_status = 'rejected'",
      paid: "approval_status = 'approved' AND payment_status = 'paid'",
      processing: "order_status = 'processing'",
      ready: "order_status = 'ready_for_pickup' OR (order_status = 'ready_to_ship' AND NOT EXISTS (SELECT 1 FROM purchase_order_events WHERE purchase_order_id = purchase_orders.id AND event_type = 'order_arrived_destination'))",
      delivered: "order_status = 'ready_to_ship' AND EXISTS (SELECT 1 FROM purchase_order_events WHERE purchase_order_id = purchase_orders.id AND event_type = 'order_arrived_destination')",
      completed: "order_status = 'completed'",
      rejected: "approval_status = 'rejected' OR order_status = 'cancelled'",
    };
    if (status) {
      conditions.push(`(${statusConditions[status] || "0 = 1"})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = this.db.prepare(
      `SELECT COUNT(*) AS count FROM purchase_orders ${where}`,
    ).get(...params).count;
    const data = this.db.prepare(`
      SELECT id, order_number AS orderNumber, customer_name AS customerName,
        product_name AS productName, build_name AS buildName,
        price_snapshot AS price, payment_method AS paymentMethod,
        payment_status AS paymentStatus, approval_status AS approvalStatus,
        approval_rejection_reason AS approvalRejectionReason,
        CASE
          WHEN order_status = 'ready_to_ship'
            AND EXISTS (SELECT 1 FROM purchase_order_events WHERE purchase_order_id = purchase_orders.id AND event_type = 'order_arrived_destination')
          THEN 'delivered'
          ELSE order_status
        END AS orderStatus,
        CASE
          WHEN order_status = 'cancelled' THEN 'cancelled'
          WHEN approval_status = 'pending_approval' AND order_status = 'awaiting_shipping_quote' THEN 'waiting_shipping_quote'
          WHEN approval_status = 'pending_approval' THEN 'pending_approval'
          WHEN approval_status = 'rejected' THEN 'rejected'
          WHEN payment_status = 'waiting_verification' THEN 'waiting_verification'
          WHEN payment_status = 'rejected' THEN 'payment_rejected'
          WHEN payment_status = 'paid' AND order_status = 'processing' THEN 'processing'
          WHEN payment_status = 'paid' AND order_status = 'ready_to_ship'
            AND EXISTS (SELECT 1 FROM purchase_order_events WHERE purchase_order_id = purchase_orders.id AND event_type = 'order_arrived_destination') THEN 'delivered'
          WHEN payment_status = 'paid' AND order_status IN ('ready_for_pickup', 'ready_to_ship') THEN 'ready'
          WHEN payment_status = 'paid' AND order_status = 'completed' THEN 'completed'
          ELSE 'pending_payment'
        END AS status,
        created_at AS createdAt
      FROM purchase_orders ${where}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    return {
      data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  cancelAndHidePurchaseOrder(id, adminId) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db.prepare(`
        UPDATE purchase_orders SET order_status = 'cancelled',
          admin_hidden_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND admin_hidden_at IS NULL
      `).run(id);
      if (!result.changes) {
        this.db.exec("ROLLBACK");
        return null;
      }
      this.recordPurchaseEvent(
        id,
        "order_cancelled_by_admin",
        "Order cancelled by Ruka",
        null,
        "admin",
        adminId,
      );
      this.db.exec("COMMIT");
      return this.getPurchaseOrderById(id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  cancelAndHideAllPurchaseOrders(adminId) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const orders = this.db.prepare(`
        SELECT id FROM purchase_orders WHERE admin_hidden_at IS NULL
      `).all();
      if (!orders.length) {
        this.db.exec("COMMIT");
        return 0;
      }
      this.db.prepare(`
        UPDATE purchase_orders SET order_status = 'cancelled',
          admin_hidden_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE admin_hidden_at IS NULL
      `).run();
      for (const { id } of orders) {
        this.recordPurchaseEvent(
          id,
          "order_cancelled_by_admin",
          "Order cancelled by Ruka",
          null,
          "admin",
          adminId,
        );
      }
      this.db.exec("COMMIT");
      return orders.length;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  verifyPurchaseAccess(id, accessToken) {
    const row = this.db.prepare(
      "SELECT access_token_hash AS tokenHash FROM purchase_orders WHERE id = ?",
    ).get(id);
    if (!row) return false;
    const expected = Buffer.from(row.tokenHash, "hex");
    const actual = Buffer.from(createHash("sha256").update(accessToken).digest("hex"), "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  setPurchaseShippingQuote(id, shippingCost) {
    const order = this.getPurchaseOrderById(id);
    const totalAmount = order ? order.price + shippingCost : NaN;
    if (!order || !Number.isSafeInteger(totalAmount)) return null;
    const result = this.db.prepare(`
      UPDATE purchase_orders
      SET shipping_cost = ?, total_amount = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND shipping_method = 'delivery'
        AND order_status = 'awaiting_shipping_quote'
        AND approval_status = 'pending_approval'
        AND payment_status = 'pending_payment'
    `).run(shippingCost, totalAmount, id);
    if (result.changes) {
      this.recordPurchaseEvent(id, "shipping_quote_set", "Shipping cost confirmed", String(shippingCost), "admin");
    }
    return result.changes > 0 ? this.getPurchaseOrderById(id) : null;
  }

  approvePurchaseOrder(id) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const order = this.getPurchaseOrderById(id);
      if (!order || order.approvalStatus !== "pending_approval" || order.orderStatus === "cancelled") {
        const error = new Error("The order is no longer awaiting approval.");
        error.code = "ORDER_NOT_APPROVABLE";
        throw error;
      }
      const product = this.getProductById(order.productId);
      let specsMatch = false;
      try {
        specsMatch = JSON.stringify(getPurchaseSpecifications(product?.fixedSpecifications))
          === order.specifications;
      } catch {
        specsMatch = false;
      }
      const isAvailable = product
        && product.purchaseEnabled === 1
        && product.purchaseType === order.purchaseType
        && product.price === order.price
        && product.name === order.productName
        && (product.buildName || product.name) === order.buildName
        && product.basis === order.basis
        && product.categoryName === order.categoryName
        && product.image === order.imageSnapshot
        && product.description === order.descriptionSnapshot
        && specsMatch
        && (
          order.purchaseType !== "ready_stock"
          || (
            product.stockStatus === "Tersedia"
            && product.purchaseStockQuantity > this.db.prepare(`
              SELECT COUNT(*) AS count FROM purchase_orders
              WHERE product_id = ? AND id != ?
                AND approval_status IN ('pending_approval', 'approved')
                AND payment_status IN ('pending_payment', 'waiting_verification')
            `).get(order.productId, id).count
          )
        );
      if (!isAvailable) {
        const error = new Error("The build, price, specifications, or stock have changed and no longer match the order snapshot.");
        error.code = "PRODUCT_SNAPSHOT_MISMATCH";
        throw error;
      }
      if (order.shippingMethod === "delivery" && order.shippingCost == null) {
        const error = new Error("Confirm the shipping cost before approving a delivery order.");
        error.code = "SHIPPING_QUOTE_REQUIRED";
        throw error;
      }
      const result = this.db.prepare(`
        UPDATE purchase_orders SET approval_status = 'approved',
          approved_at = CURRENT_TIMESTAMP, order_status = 'awaiting_payment',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND approval_status = 'pending_approval' AND order_status != 'cancelled'
      `).run(id);
      if (!result.changes) {
        const error = new Error("The order is no longer awaiting approval.");
        error.code = "ORDER_NOT_APPROVABLE";
        throw error;
      }
      this.recordPurchaseEvent(id, "approval_approved", "Disetujui admin", null, "admin");
      this.db.exec("COMMIT");
      return this.getPurchaseOrderById(id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  rejectPurchaseOrder(id, reason) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db.prepare(`
        UPDATE purchase_orders SET approval_status = 'rejected',
          approval_rejection_reason = ?, order_status = 'cancelled',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND approval_status = 'pending_approval'
      `).run(reason, id);
      if (!result.changes) {
        this.db.exec("ROLLBACK");
        return null;
      }
      this.recordPurchaseEvent(id, "approval_rejected", "Order not approved", reason, "admin");
      this.db.exec("COMMIT");
      return this.getPurchaseOrderById(id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  savePurchasePaymentProof(id, paymentProof, customerId = null) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const order = this.getPurchaseOrderById(id);
      if (
        !order
        || order.approvalStatus !== "approved"
        || !["pending_payment", "waiting_verification", "rejected"].includes(order.paymentStatus)
        || order.orderStatus !== "awaiting_payment"
      ) {
        const error = new Error("The order cannot accept payment proof yet.");
        error.code = "ORDER_NOT_PAYABLE";
        throw error;
      }
      const historyId = randomUUID();
      this.db.prepare(`
        INSERT INTO purchase_payment_proofs (id, purchase_order_id, filename, customer_id)
        VALUES (?, ?, ?, ?)
      `).run(historyId, id, paymentProof, customerId);
      this.db.prepare(`
        UPDATE purchase_orders SET payment_proof = ?,
          payment_status = 'waiting_verification', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(paymentProof, id);
      const isReupload = Boolean(order.paymentProof);
      this.recordPurchaseEvent(
        id,
        isReupload ? "payment_proof_replaced" : "payment_proof_submitted",
        isReupload ? "Payment proof updated" : "Payment proof submitted",
        null,
        customerId ? "customer" : "system",
        customerId,
      );
      this.db.exec("COMMIT");
      return this.getPurchaseOrderById(id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  reviewPurchasePayment(id, decision) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const order = this.getPurchaseOrderById(id);
      if (
        !order
        || order.orderStatus === "cancelled"
        || order.paymentStatus !== "waiting_verification"
        || !order.paymentProof
      ) {
        const error = new Error("The order has no payment proof awaiting verification.");
        error.code = "PAYMENT_NOT_REVIEWABLE";
        throw error;
      }
      if (decision === "paid" && order.purchaseType === "ready_stock") {
        const product = this.db.prepare(`
          SELECT purchase_stock_quantity AS quantity FROM products WHERE id = ?
        `).get(order.productId);
        const reservedElsewhere = this.db.prepare(`
          SELECT COUNT(*) AS count FROM purchase_orders
          WHERE product_id = ? AND id != ?
            AND payment_status IN ('pending_payment', 'waiting_verification')
        `).get(order.productId, id).count;
        if (!product || product.quantity <= reservedElsewhere) {
          const error = new Error("There is no longer enough ready stock for this order.");
          error.code = "STOCK_UNAVAILABLE";
          throw error;
        }
        this.db.prepare(`
          UPDATE products SET purchase_stock_quantity = purchase_stock_quantity - 1,
            updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(order.productId);
      }
      const status = decision === "paid" ? "processing" : "awaiting_payment";
      this.db.prepare(`
        UPDATE purchase_orders SET payment_status = ?, order_status = ?,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(decision, status, id);
      this.recordPurchaseEvent(
        id,
        decision === "paid" ? "payment_confirmed" : "payment_rejected",
        decision === "paid" ? "Payment confirmed" : "Payment proof rejected",
        null,
        "admin",
      );
      this.db.exec("COMMIT");
      return this.getPurchaseOrderById(id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  updatePurchaseOrderStatus(id, orderStatus) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.getPurchaseOrderById(id);
      if (
        orderStatus === "delivered"
        && current
        && current.paymentStatus === "paid"
        && current.shippingMethod === "delivery"
        && current.orderStatus === "ready_to_ship"
        && !current.adminHiddenAt
      ) {
        this.db.prepare(`
          UPDATE purchase_orders SET updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND order_status = 'ready_to_ship' AND admin_hidden_at IS NULL
        `).run(id);
        this.recordPurchaseEvent(
          id,
          "order_arrived_destination",
          "Order arrived at destination",
          null,
          "admin",
        );
        this.db.exec("COMMIT");
        return this.getPurchaseOrderById(id);
      }
      const nextStatuses = {
        processing: current?.shippingMethod === "pickup"
          ? ["ready_for_pickup", "cancelled"]
          : ["ready_to_ship", "cancelled"],
        ready_for_pickup: ["completed"],
        ready_to_ship: ["completed"],
        delivered: ["completed"],
      };
      if (
        !current
        || current.adminHiddenAt
        || current.paymentStatus !== "paid"
        || !nextStatuses[current.orderStatus]?.includes(orderStatus)
        || (orderStatus === "completed" && !current.canAdminComplete)
      ) {
        this.db.exec("ROLLBACK");
        return null;
      }
      const result = this.db.prepare(`
        UPDATE purchase_orders
        SET order_status = ?,
          admin_hidden_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE admin_hidden_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND payment_status = 'paid' AND order_status = ? AND admin_hidden_at IS NULL
      `).run(
        orderStatus,
        orderStatus,
        id,
        current.orderStatus === "delivered" ? "ready_to_ship" : current.orderStatus,
      );
      if (!result.changes) {
        this.db.exec("ROLLBACK");
        return null;
      }
      const eventLabels = {
        processing: "Order processing started",
        ready_for_pickup: "Order ready for pickup",
        ready_to_ship: "Order delivery",
        completed: "Order completed",
        cancelled: "Order cancelled",
      };
      this.recordPurchaseEvent(id, `order_${orderStatus}`, eventLabels[orderStatus], null, "admin");
      this.db.exec("COMMIT");
      return this.getPurchaseOrderById(id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  createConsultation(consultation) {
    const referenceMotor = consultation.referenceMotor || null;
    const insert = this.db.prepare(`
      INSERT INTO orders (
        id, name, email, phone, city, build_interest, budget, message,
        reference_image, reference_images, donor_motor, reference_product_id,
        reference_product_name, reference_build_name, reference_build_code,
        reference_category, reference_basis, reference_price,
        reference_motor_id, reference_motor_name, reference_motor_build_name,
        reference_motor_basis, reference_motor_image, reference_motor_selected, consent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      insert.run(
        consultation.id,
        consultation.fullName,
        consultation.email || "",
        consultation.phone,
        consultation.city,
        consultation.buildName || consultation.productName,
        consultation.budgetRange,
        consultation.requirements,
        consultation.referenceImages[0] || null,
        JSON.stringify(consultation.referenceImages),
        consultation.donorMotor,
        consultation.productId,
        consultation.productName,
        consultation.buildName || null,
        consultation.buildCode || null,
        consultation.categoryName || null,
        consultation.basis || null,
        consultation.price,
        referenceMotor?.id || null,
        referenceMotor?.name || null,
        referenceMotor?.buildName || null,
        referenceMotor?.basis || null,
        referenceMotor?.image || null,
        1,
        1,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.db
      .prepare("SELECT id, created_at AS createdAt FROM orders WHERE id = ?")
      .get(consultation.id);
  }

  getConsultations({ name = "", phone = "", productId = "", page = 1, pageSize = 10, sort = "desc" }) {
    const conditions = [];
    const params = [];
    const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

    if (name) {
      conditions.push("name LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(name)}%`);
    }
    if (phone) {
      conditions.push("phone LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(phone)}%`);
    }
    if (productId) {
      conditions.push("reference_product_id = ?");
      params.push(productId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = this.db
      .prepare(`SELECT COUNT(*) AS count FROM orders ${where}`)
      .get(...params).count;
    const offset = (page - 1) * pageSize;
    const data = this.db.prepare(`
      SELECT id, name AS customerName, phone, city, budget AS budgetRange,
        build_interest AS buildInterest, reference_product_id AS productId,
        reference_product_name AS productName, reference_build_name AS buildName,
        reference_build_code AS buildCode, reference_basis AS basis,
        reference_category AS categoryName, reference_motor_id AS referenceMotorId,
        reference_motor_name AS referenceMotorName,
        reference_motor_build_name AS referenceMotorBuildName,
        reference_motor_basis AS referenceMotorBasis,
        reference_motor_selected AS referenceMotorSelected, status, created_at AS createdAt
      FROM orders
      ${where}
      ORDER BY created_at ${sort === "asc" ? "ASC" : "DESC"}, id ${sort === "asc" ? "ASC" : "DESC"}
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);
    const products = this.db.prepare(`
      SELECT reference_product_id AS id,
        COALESCE(reference_build_name, reference_product_name, build_interest) AS name
      FROM orders
      WHERE reference_product_id IS NOT NULL
      GROUP BY reference_product_id, name
      ORDER BY name COLLATE NOCASE ASC
    `).all();
    const statuses = this.db.prepare(
      "SELECT DISTINCT status FROM orders WHERE status IS NOT NULL AND status != '' ORDER BY status",
    ).all().map(({ status }) => status);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      products,
      statuses,
    };
  }

  getConsultationById(id) {
    const consultation = this.db.prepare(`
      SELECT id, name AS customerName, phone, email, city,
        build_interest AS buildInterest, budget AS budgetRange,
        message AS requirements, donor_motor AS donorMotor,
        reference_product_id AS productId,
        reference_product_name AS productName,
        reference_build_name AS buildName,
        reference_build_code AS buildCode,
        reference_category AS categoryName,
        reference_basis AS basis, reference_price AS price,
        reference_motor_id AS referenceMotorId,
        reference_motor_name AS referenceMotorName,
        reference_motor_build_name AS referenceMotorBuildName,
        reference_motor_basis AS referenceMotorBasis,
        reference_motor_image AS referenceMotorImage,
        reference_motor_selected AS referenceMotorSelected,
        reference_images AS referenceImagesJson, reference_image AS referenceImage,
        status, created_at AS createdAt
      FROM orders
      WHERE id = ?
    `).get(id);

    if (!consultation) return null;

    const photos = this.parseConsultationImages(
      consultation.referenceImagesJson,
      consultation.referenceImage,
    );
    delete consultation.referenceImagesJson;
    delete consultation.referenceImage;
    const statusOptions = this.db.prepare(
      "SELECT DISTINCT status FROM orders WHERE status IS NOT NULL AND status != '' ORDER BY status",
    ).all().map(({ status }) => status);
    if (!statusOptions.includes("completed")) {
      statusOptions.push("completed");
      statusOptions.sort();
    }

    return {
      ...consultation,
      statusOptions,
      photos: photos.map((_, index) => `/api/consultations/${encodeURIComponent(id)}/photos/${index}`),
    };
  }

  getConsultationPhotoPath(id, index) {
    const consultation = this.db.prepare(`
      SELECT reference_images AS referenceImagesJson, reference_image AS referenceImage
      FROM orders
      WHERE id = ?
    `).get(id);
    if (!consultation) return null;

    return this.parseConsultationImages(
      consultation.referenceImagesJson,
      consultation.referenceImage,
    )[index] || null;
  }

  parseConsultationImages(imagesJson, legacyImage) {
    let images = [];
    try {
      const parsed = JSON.parse(imagesJson || "[]");
      if (Array.isArray(parsed)) {
        images = parsed.filter((image) => typeof image === "string" && image);
      }
    } catch (error) {
      console.error("Consultation photo references are not valid JSON.", error);
    }

    if (!images.length && typeof legacyImage === "string" && legacyImage) {
      images = [legacyImage];
    }
    return images;
  }

  updateConsultationStatus(id, status) {
    const allowedStatuses = this.db.prepare(
      "SELECT DISTINCT status FROM orders WHERE status IS NOT NULL AND status != ''",
    ).all().map(({ status: existingStatus }) => existingStatus);
    if (!allowedStatuses.includes("completed")) allowedStatuses.push("completed");
    if (!allowedStatuses.includes(status)) {
      return { invalidStatus: true, allowedStatuses };
    }

    const result = this.db.prepare(
      "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(status, id);
    if (!result.changes) return null;
    return this.getConsultationById(id);
  }

  deleteCompletedConsultation(id) {
    const result = this.db.prepare(
      "DELETE FROM orders WHERE id = ? AND LOWER(TRIM(status)) = 'completed'",
    ).run(id);
    return result.changes > 0;
  }

  getDashboardSummary() {
    const products = this.db.prepare(`
      SELECT p.id, p.name, p.category_id AS categoryId, c.name AS categoryName,
        p.price, p.stock_status AS stockStatus, p.image, p.created_at AS createdAt
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ORDER BY p.created_at DESC, p.id ASC
    `).all();
    const categories = this.db.prepare(
      "SELECT COUNT(*) AS count FROM categories",
    ).get().count;
    const consultations = this.db.prepare(
      "SELECT COUNT(*) AS count FROM orders",
    ).get().count;
    const latestConsultations = this.db.prepare(`
      SELECT id, name AS customerName, phone, city, donor_motor AS donorMotor,
        build_interest AS buildInterest, reference_product_name AS productName,
        reference_build_name AS buildName, reference_basis AS basis,
        reference_category AS categoryName, status,
        created_at AS createdAt
      FROM orders
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `).all();
    const purchaseOrders = this.db.prepare(
      "SELECT COUNT(*) AS count FROM purchase_orders WHERE admin_hidden_at IS NULL",
    ).get().count;
    const latestPurchaseOrders = this.db.prepare(`
      SELECT id, order_number AS orderNumber, customer_name AS customerName,
        product_name AS productName, price_snapshot AS price,
        payment_status AS paymentStatus, approval_status AS approvalStatus,
        approval_rejection_reason AS approvalRejectionReason,
        order_status AS orderStatus,
        CASE
          WHEN approval_status = 'rejected' THEN 'rejected'
          WHEN order_status = 'cancelled' THEN 'cancelled'
          WHEN approval_status = 'pending_approval' AND order_status = 'awaiting_shipping_quote' THEN 'waiting_shipping_quote'
          WHEN approval_status = 'pending_approval' THEN 'pending_approval'
          WHEN approval_status = 'rejected' THEN 'rejected'
          WHEN payment_status = 'waiting_verification' THEN 'waiting_verification'
          WHEN payment_status = 'rejected' THEN 'payment_rejected'
          WHEN payment_status = 'paid' AND order_status = 'processing' THEN 'processing'
          WHEN payment_status = 'paid' AND order_status IN ('ready_for_pickup', 'ready_to_ship') THEN 'ready'
          WHEN payment_status = 'paid' AND order_status = 'completed' THEN 'completed'
          ELSE 'pending_payment'
        END AS status,
        created_at AS createdAt
      FROM purchase_orders
      WHERE admin_hidden_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `).all();

    return {
      products,
      categories,
      consultations,
      latestConsultations,
      purchaseOrders,
      latestPurchaseOrders,
    };
  }
}

export const db = new SqliteDatabase();
