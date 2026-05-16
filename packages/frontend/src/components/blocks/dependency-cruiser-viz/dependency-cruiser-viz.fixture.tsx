import type { DependencyGraph } from './types';

import { DependencyCruiserViz } from './dependency-cruiser-viz';

// ── Minimal: two modules, one edge ──────────────────────────────────────────
const minimal: DependencyGraph = {
  layers: [
    { id: 0, label: 'Core' },
    { id: 1, label: 'App' },
  ],
  modules: [
    { id: 'core/utils', label: 'Utils', layer: 0 },
    { id: 'app/main', label: 'Main', layer: 1 },
  ],
  edges: [{ from: 'app/main', to: 'core/utils', status: 'allowed' }],
  rules: [
    { layer: 0, canImportFromLayers: [] },
    { layer: 1, canImportFromLayers: [0] },
  ],
};

// ── Single violation: clean graph with one bad edge ─────────────────────────
const singleViolation: DependencyGraph = {
  layers: [
    { id: 0, label: 'Shared' },
    { id: 1, label: 'Domain' },
    { id: 2, label: 'UI' },
  ],
  modules: [
    { id: 'shared/config', label: 'Config', layer: 0 },
    { id: 'domain/auth', label: 'Auth', layer: 1 },
    { id: 'domain/billing', label: 'Billing', layer: 1 },
    { id: 'ui/login', label: 'Login Page', layer: 2 },
  ],
  edges: [
    { from: 'ui/login', to: 'domain/auth', status: 'allowed' },
    { from: 'domain/auth', to: 'shared/config', status: 'allowed' },
    { from: 'domain/billing', to: 'shared/config', status: 'allowed' },
    { from: 'shared/config', to: 'domain/auth', status: 'violated' },
  ],
  rules: [
    { layer: 0, canImportFromLayers: [] },
    { layer: 1, canImportFromLayers: [0] },
    { layer: 2, canImportFromLayers: [0, 1] },
  ],
};

// ── Medium: 4-layer architecture ────────────────────────────────────────────
const graph: DependencyGraph = {
  layers: [
    { id: 0, label: 'Foundation' },
    { id: 1, label: 'Domain' },
    { id: 2, label: 'Features' },
    { id: 3, label: 'Routes' },
  ],
  modules: [
    { id: 'lib/utils', label: 'Utils', layer: 0 },
    { id: 'lib/validation', label: 'Validation', layer: 0 },
    { id: 'domain/campaigns', label: 'Campaigns', layer: 1 },
    { id: 'domain/vouchers', label: 'Vouchers', layer: 1 },
    { id: 'domain/customers', label: 'Customers', layer: 1 },
    {
      id: 'features/redemptions',
      label: 'Redemptions',
      layer: 2,
      description: 'Voucher & promo redemption flows',
    },
    { id: 'features/analytics', label: 'Analytics', layer: 2 },
    { id: 'routes/dashboard', label: 'Dashboard', layer: 3 },
    { id: 'routes/campaigns', label: 'Campaign Editor', layer: 3 },
  ],
  edges: [
    // Routes -> Features
    {
      from: 'routes/dashboard',
      to: 'features/redemptions',
      status: 'allowed',
    },
    { from: 'routes/dashboard', to: 'features/analytics', status: 'allowed' },
    {
      from: 'routes/campaigns',
      to: 'features/redemptions',
      status: 'allowed',
    },
    // Routes -> Domain
    { from: 'routes/campaigns', to: 'domain/campaigns', status: 'allowed' },
    // Features -> Domain
    {
      from: 'features/redemptions',
      to: 'domain/campaigns',
      status: 'allowed',
    },
    {
      from: 'features/redemptions',
      to: 'domain/vouchers',
      status: 'allowed',
    },
    { from: 'features/analytics', to: 'domain/customers', status: 'allowed' },
    // Domain -> Foundation
    { from: 'domain/campaigns', to: 'lib/validation', status: 'allowed' },
    { from: 'domain/vouchers', to: 'lib/validation', status: 'allowed' },
    { from: 'domain/customers', to: 'lib/utils', status: 'allowed' },
    // Violations
    {
      from: 'domain/campaigns',
      to: 'features/redemptions',
      status: 'violated',
    },
    { from: 'lib/validation', to: 'domain/campaigns', status: 'violated' },
  ],
  rules: [
    { layer: 0, canImportFromLayers: [] },
    { layer: 1, canImportFromLayers: [0] },
    { layer: 2, canImportFromLayers: [0, 1] },
    { layer: 3, canImportFromLayers: [0, 1, 2] },
  ],
};

// ── Dense: 5 layers, many modules, lots of cross-cutting edges ──────────────
const dense: DependencyGraph = {
  layers: [
    { id: 0, label: 'Primitives' },
    { id: 1, label: 'Domain' },
    { id: 2, label: 'Services' },
    { id: 3, label: 'Features' },
    { id: 4, label: 'Pages' },
  ],
  modules: [
    { id: 'prim/types', label: 'Types', layer: 0 },
    { id: 'prim/utils', label: 'Utils', layer: 0 },
    { id: 'prim/config', label: 'Config', layer: 0 },
    { id: 'domain/users', label: 'Users', layer: 1 },
    { id: 'domain/products', label: 'Products', layer: 1 },
    { id: 'domain/orders', label: 'Orders', layer: 1 },
    { id: 'domain/inventory', label: 'Inventory', layer: 1 },
    { id: 'svc/auth', label: 'Auth Service', layer: 2 },
    { id: 'svc/payments', label: 'Payments', layer: 2 },
    { id: 'svc/notifications', label: 'Notifications', layer: 2 },
    {
      id: 'feat/checkout',
      label: 'Checkout',
      layer: 3,
      description: 'Cart → payment → confirmation',
    },
    { id: 'feat/catalog', label: 'Catalog', layer: 3 },
    {
      id: 'feat/admin',
      label: 'Admin Panel',
      layer: 3,
      description: 'Inventory & order management',
    },
    { id: 'pages/home', label: 'Home', layer: 4 },
    { id: 'pages/shop', label: 'Shop', layer: 4 },
    { id: 'pages/admin', label: 'Admin', layer: 4 },
  ],
  edges: [
    // Pages -> Features
    { from: 'pages/home', to: 'feat/catalog', status: 'allowed' },
    { from: 'pages/shop', to: 'feat/checkout', status: 'allowed' },
    { from: 'pages/shop', to: 'feat/catalog', status: 'allowed' },
    { from: 'pages/admin', to: 'feat/admin', status: 'allowed' },
    // Features -> Services
    { from: 'feat/checkout', to: 'svc/payments', status: 'allowed' },
    { from: 'feat/checkout', to: 'svc/auth', status: 'allowed' },
    { from: 'feat/admin', to: 'svc/notifications', status: 'allowed' },
    // Features -> Domain
    { from: 'feat/checkout', to: 'domain/orders', status: 'allowed' },
    { from: 'feat/catalog', to: 'domain/products', status: 'allowed' },
    { from: 'feat/admin', to: 'domain/inventory', status: 'allowed' },
    { from: 'feat/admin', to: 'domain/orders', status: 'allowed' },
    // Services -> Domain
    { from: 'svc/auth', to: 'domain/users', status: 'allowed' },
    { from: 'svc/payments', to: 'domain/orders', status: 'allowed' },
    { from: 'svc/notifications', to: 'domain/users', status: 'allowed' },
    // Domain -> Primitives
    { from: 'domain/users', to: 'prim/types', status: 'allowed' },
    { from: 'domain/products', to: 'prim/types', status: 'allowed' },
    { from: 'domain/orders', to: 'prim/utils', status: 'allowed' },
    { from: 'domain/inventory', to: 'prim/config', status: 'allowed' },
    // Violations
    { from: 'domain/orders', to: 'svc/payments', status: 'violated' },
    { from: 'prim/utils', to: 'domain/users', status: 'violated' },
    { from: 'svc/payments', to: 'feat/checkout', status: 'violated' },
  ],
  rules: [
    { layer: 0, canImportFromLayers: [] },
    { layer: 1, canImportFromLayers: [0] },
    { layer: 2, canImportFromLayers: [0, 1] },
    { layer: 3, canImportFromLayers: [0, 1, 2] },
    { layer: 4, canImportFromLayers: [0, 1, 2, 3] },
  ],
};

export default {
  minimal: <DependencyCruiserViz graph={minimal} />,
  'single-violation': <DependencyCruiserViz graph={singleViolation} />,
  medium: <DependencyCruiserViz graph={graph} />,
  'medium-top-to-bottom': (
    <DependencyCruiserViz graph={graph} direction="top-to-bottom" />
  ),
  dense: <DependencyCruiserViz graph={dense} />,
};
