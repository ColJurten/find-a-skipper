import type { Application, Mission } from '@/lib/database.types';

/**
 * "En cours": pending or accepted on a mission that is still open or assigned.
 * Everything else (declined, withdrawn, completed or cancelled missions) is history.
 */
export function isCurrentApplication(row: Pick<Application, 'status'> & { missions?: Pick<Mission, 'status'> | null }) {
  const missionActive = row.missions?.status === 'open' || row.missions?.status === 'assigned';
  return (row.status === 'pending' || row.status === 'accepted') && missionActive;
}

/** Only a pending application can be withdrawn; an accepted one is locked to keep the mission history consistent. */
export function canWithdrawApplication(row: Pick<Application, 'status'>) {
  return row.status === 'pending';
}
