type BranchUser = { role?: string; branchId?: string | null } | null | undefined
type BranchChoice = { id: string; isPrimary?: boolean }

export function defaultBranchId(user: BranchUser, branches: BranchChoice[] = []): string {
  if (user?.branchId && (!branches.length || branches.some(branch => branch.id === user.branchId))) return user.branchId
  const primary = branches.find(branch => branch.isPrimary)
  if (primary) return primary.id
  if (branches.length === 1 || (user && user.role !== 'owner' && branches.length > 0)) return branches[0].id
  return ''
}
