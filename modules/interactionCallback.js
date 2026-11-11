/**
 * discord.js `withResponse: true` returns an InteractionCallbackResponse.
 * The created message lives at `.resource.message`, not on the response itself.
 * Tests and older mocks may still return a Message-like object directly.
 */
export function callbackMessage(response) {
  if (!response) return null;
  if (response.resource?.message) return response.resource.message;
  return response;
}
