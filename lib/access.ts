// Role-based page access, enforced server-side by middleware.ts (and by RLS in the database).

const RECRUITER_ONLY_PREFIXES = ['/skippers', '/missions/new', '/my-missions'];
const SKIPPER_ONLY_PREFIXES = ['/my-applications'];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Returns true when a user with this role may open the page. */
export function canAccessPath(role: string | null | undefined, pathname: string) {
  if (RECRUITER_ONLY_PREFIXES.some((prefix) => matches(pathname, prefix))) {
    // The skipper directory and profiles are never available to skippers.
    return role === 'owner' || role === 'broker' || role === 'charter_company' || (role === 'admin' && matches(pathname, '/skippers'));
  }
  if (SKIPPER_ONLY_PREFIXES.some((prefix) => matches(pathname, prefix))) {
    return role === 'skipper';
  }
  if (matches(pathname, '/dashboard/admin')) return role === 'admin';
  return true;
}
