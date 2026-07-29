const ROLE_GROUPS = {
  laundry: ['çama', 'cama', 'laundry'],
  housekeeping: ['temizlik', 'meydan', 'housekeep'],
  technical: ['teknik'],
}

export function avsRoleGroup(departmentName = '') {
  const department = String(departmentName || '').toLocaleLowerCase('tr-TR')
  for (const [group, needles] of Object.entries(ROLE_GROUPS)) {
    if (needles.some(needle => department.includes(needle))) return group
  }
  return 'general'
}

