import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { randomUUID } from 'node:crypto'
import prisma from '../db.js'

const challengeTtlMs = 5 * 60 * 1000

export async function requiresBusinessSwitchSecurity({ id, role, tenantId }) {
  if (!id) return false
  const [memberships, ownedTenants] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { userId: id, role: 'owner', isActive: true },
      select: { tenantId: true },
    }),
    prisma.tenant.findMany({ where: { ownerId: id }, select: { id: true } }),
  ])
  const businessIds = new Set([
    ...memberships.map(({ tenantId: membershipTenantId }) => membershipTenantId),
    ...ownedTenants.map(({ id: ownedTenantId }) => ownedTenantId),
  ])
  const hasOwnerRelationship = role === 'owner' || memberships.length > 0 || ownedTenants.length > 0
  if (!hasOwnerRelationship) return false
  if (tenantId) businessIds.add(tenantId)
  return businessIds.size > 1
}

export function hasBusinessSwitchSecuritySetup(user) {
  return Boolean(user?.securitySetupCompletedAt && ['passkey', 'password'].includes(user?.businessSwitchSecurityMethod))
}

export function webAuthnContext(req) {
  const origin = String(req.headers.origin || '').replace(/\/$/, '')
  const configuredOrigins = [process.env.WEBAUTHN_ORIGIN, process.env.FRONTEND_ORIGIN, process.env.ALLOWED_ORIGINS]
    .filter(Boolean)
    .flatMap(value => value.split(','))
    .map(value => value.trim().replace(/\/$/, ''))
  const allowedOrigins = configuredOrigins.length
    ? configuredOrigins
    : ['https://jibusales.jibusales00.workers.dev']
  if (process.env.NODE_ENV !== 'production') allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173')
  if (!origin || !allowedOrigins.includes(origin)) throw new Error('This app origin is not configured for passkeys.')
  const hostname = new URL(origin).hostname
  const rpID = String(process.env.WEBAUTHN_RP_ID || hostname).trim().toLowerCase()
  if (hostname !== rpID && !hostname.endsWith(`.${rpID}`)) throw new Error('Passkey relying-party ID does not match the app origin.')
  return { origin, rpID }
}

async function saveChallenge({ userId, purpose, targetTenantId, challenge, origin, rpID }) {
  const expiresAt = new Date(Date.now() + challengeTtlMs)
  await prisma.userSecurityChallenge.deleteMany({ where: { userId, purpose } })
  await prisma.userSecurityChallenge.create({
    data: { id: randomUUID(), userId, purpose, targetTenantId: targetTenantId || null, challenge, origin, rpId: rpID, expiresAt },
  })
}

export async function registrationOptions(req, user) {
  const { origin, rpID } = webAuthnContext(req)
  const existing = await prisma.securityPasskey.findMany({ where: { userId: user.id, rpId: rpID }, select: { credentialId: true, transports: true } })
  const options = await generateRegistrationOptions({
    rpName: 'JibuSales',
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: `${user.fname || ''} ${user.lname || ''}`.trim() || user.email,
    attestationType: 'none',
    excludeCredentials: existing.map(item => ({ id: item.credentialId, transports: item.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  })
  await saveChallenge({ userId: user.id, purpose: 'registration', challenge: options.challenge, origin, rpID })
  return options
}

export async function verifyRegistration(req, user, response, name) {
  const challenge = await prisma.userSecurityChallenge.findFirst({
    where: { userId: user.id, purpose: 'registration', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  if (!challenge) throw new Error('The passkey setup expired. Start again.')
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.origin,
    expectedRPID: challenge.rpId,
    requireUserVerification: true,
  })
  if (!result.verified || !result.registrationInfo?.userVerified) throw new Error('The device could not verify your passkey.')
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo
  await prisma.$transaction(async tx => {
    await tx.securityPasskey.create({
      data: {
        id: randomUUID(), userId: user.id, credentialId: credential.id,
        rpId: challenge.rpId,
        publicKey: Buffer.from(credential.publicKey), counter: BigInt(credential.counter),
        transports: credential.transports || [], deviceType: credentialDeviceType,
        backedUp: credentialBackedUp, name: String(name || 'This device').trim().slice(0, 80) || 'This device',
      },
    })
    await tx.user.update({ where: { id: user.id }, data: { securitySetupCompletedAt: new Date(), businessSwitchSecurityMethod: 'passkey' } })
    await tx.userSecurityChallenge.deleteMany({ where: { id: challenge.id } })
  })
  return { method: 'passkey' }
}

export async function authenticationOptions(req, user, targetTenantId) {
  const { origin, rpID } = webAuthnContext(req)
  const credentials = await prisma.securityPasskey.findMany({ where: { userId: user.id, rpId: rpID }, select: { credentialId: true, transports: true } })
  if (!credentials.length) throw new Error('No passkey is registered for this account.')
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map(item => ({ id: item.credentialId, transports: item.transports })),
    userVerification: 'required',
  })
  await saveChallenge({ userId: user.id, purpose: 'business-switch', targetTenantId, challenge: options.challenge, origin, rpID })
  return options
}

export async function verifyBusinessSwitch(req, user, targetTenantId, assertion) {
  const challenge = await prisma.userSecurityChallenge.findFirst({
    where: { userId: user.id, purpose: 'business-switch', targetTenantId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  if (!challenge) throw new Error('Business-switch confirmation expired. Try again.')
  const saved = await prisma.securityPasskey.findFirst({ where: { userId: user.id, credentialId: assertion?.id, rpId: challenge.rpId } })
  if (!saved) throw new Error('This passkey is not registered to your JibuSales account.')
  const result = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.origin,
    expectedRPID: challenge.rpId,
    requireUserVerification: true,
    credential: {
      id: saved.credentialId,
      publicKey: new Uint8Array(saved.publicKey),
      counter: Number(saved.counter),
      transports: saved.transports,
    },
  })
  if (!result.verified || !result.authenticationInfo.userVerified) throw new Error('Passkey confirmation failed.')
  const consumed = await prisma.$transaction(async tx => {
    const deletion = await tx.userSecurityChallenge.deleteMany({ where: { id: challenge.id, expiresAt: { gt: new Date() } } })
    if (deletion.count !== 1) return false
    await tx.securityPasskey.update({
      where: { id: saved.id },
      data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date(), backedUp: result.authenticationInfo.credentialBackedUp, deviceType: result.authenticationInfo.credentialDeviceType },
    })
    return true
  })
  if (!consumed) throw new Error('Business-switch confirmation was already used. Try again.')
}
