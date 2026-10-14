/**
 * The account password floor. Lives in the shared package so the API's
 * Better Auth config and the web sign-up form can never drift apart —
 * the server is the authority, the client pre-check only avoids a
 * pointless round-trip.
 */
export const MIN_PASSWORD_LENGTH = 10;
