import jwt from "jsonwebtoken";

export const ACCESS_TOKEN_TTL_SECONDS = 8 * 60 * 60;
export const REFRESH_TOKEN_TTL = "30d";

export function createSessionTokens(userClaims, secret) {
  const accessToken = jwt.sign(userClaims, secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  const refreshToken = jwt.sign({ id: userClaims.id, type: "refresh" }, secret, { expiresIn: REFRESH_TOKEN_TTL });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    tokenType: "Bearer",
  };
}
