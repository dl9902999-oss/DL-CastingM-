import type { UserProfile, UserRole } from './types';

const pageRoles: Record<string, UserRole[]> = {
  '/dashboard': ['Admin', 'Production', 'QC', 'Warehouse'],
  '/customers': ['Admin', 'Production'],
  '/suppliers': ['Admin', 'Production'],
  '/work-orders': ['Admin', 'Production'],
  '/molding': ['Admin', 'Production'],
  '/melting-management': ['Admin', 'Production'],
  '/quality': ['Admin', 'QC'],
  '/warehouse': ['Admin', 'Warehouse'],
  '/shipment': ['Admin', 'Warehouse'],
  '/mold-management': ['Admin', 'Production'],
  '/traceability': ['Admin', 'Production', 'QC', 'Warehouse'],
  '/sync-history': ['Admin', 'Production', 'QC', 'Warehouse'],
  '/user-management': ['Admin'],
  '/sync-verify': ['Admin'],
};

// Presentation guard only. Database policies must independently enforce access.
export function canAccessPage(user: UserProfile | null, path: string): boolean {
  if (!user || !Object.hasOwn(pageRoles, path)) return false;
  if (!['Admin', 'Production', 'QC', 'Warehouse'].includes(user.role)) return false;
  if (['/user-management', '/sync-verify'].includes(path) && user.role !== 'Admin') return false;
  // Existing administrators who manage permissions can access this new directory
  // without rewriting stored employee permissions. Empty permissions still deny.
  if (path === '/suppliers' && user.role === 'Admin' && user.permissions?.includes('/user-management')) return true;
  // An explicitly empty permission list grants no pages.
  if (user.permissions !== undefined) return user.permissions.includes(path);
  return pageRoles[path].includes(user.role);
}
