import jwt from "jsonwebtoken";

export const ACCESS_TOKEN_TTL_SECONDS = 8 * 60 * 60;
export const REFRESH_TOKEN_TTL = "30d";

export function createSessionTokens(userClaims, secret) {
  // Permissions are resolved from the database on authenticated requests. Keeping
  // the full permission catalog in the JWT can exceed upstream header limits.
  const { permissions: _permissions, ...identityClaims } = userClaims;
  const accessToken = jwt.sign(identityClaims, secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  const refreshToken = jwt.sign({
    id: userClaims.id,
    type: "refresh",
    tenantId: userClaims.tenantId || null,
    activeTenantId: userClaims.activeTenantId || userClaims.tenantId || null,
  }, secret, { expiresIn: REFRESH_TOKEN_TTL });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    tokenType: "Bearer",
  };
}
