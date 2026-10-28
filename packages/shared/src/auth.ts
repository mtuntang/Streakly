/**
 * The account password floor. Lives in the shared package so the API's
 * Better Auth config and the web sign-up form can never drift apart —
 * the server is the authority, the client pre-check only avoids a
 * pointless round-trip.
 */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * The longest display name an account may have. The server rejects longer
 * names on sign-up and profile update; the sign-up field stops typing at it.
 */
export const MAX_NAME_LENGTH = 80;
