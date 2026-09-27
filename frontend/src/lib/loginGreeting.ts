type AccountHolder = { name?: string; fname?: string; lname?: string }

export function loginGreeting(user?: AccountHolder): string {
  const name = user?.name?.trim() || [user?.fname?.trim(), user?.lname?.trim()].filter(Boolean).join(' ')
  return name ? `Welcome back, ${name}!` : 'Welcome back!'
}
