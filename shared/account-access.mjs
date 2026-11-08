export const ACCOUNT_ROLES = ['viewer', 'flagship_employee', 'harbour', 'admin']
export function canReadFlagshipPlanning(user) {
  return ['admin', 'flagship_employee'].includes(user?.role)
}
export function canUseOperations(user) {
  return ['admin', 'flagship_employee', 'harbour'].includes(user?.role)
}
export function accountRoleLabel(role) {
  return {viewer:'Gebruiker',flagship_employee:'Flagship employee',harbour:'Harbour',admin:'Beheerder'}[role] || 'Gebruiker'
}
