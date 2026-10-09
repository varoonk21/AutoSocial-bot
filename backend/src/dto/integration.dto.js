/**
 * Integration DTO
 *
 * Integrations carry provider credentials (token, refreshToken, tokenExpiration,
 * additionalSettings …). None of that may ever leave the server, so every
 * integration returned from a controller must pass through toIntegrationDTO,
 * and every provider page list through sanitizePages.
 *
 * IntegrationDTO:
 *   { id, platform, name, avatar, status, targetId }
 */

/**
 * Map an Integration document (or plain object) to its public DTO shape.
 *
 * @param {object} integration
 * @returns {{ id: string, platform: string, name: string, avatar: string,
 *             status: "active"|"disabled"|"reauth_required", targetId: string }|null}
 */
function toIntegrationDTO(integration) {
  if (!integration) return null;
  const doc =
    typeof integration.toObject === "function" ? integration.toObject() : integration;

  let status = 'active';
  if (doc.disabled) status = 'disabled';
  else if (doc.refreshNeeded) status = 'reauth_required';

  return {
    id: String(doc._id ?? doc.id ?? ''),
    platform: doc.providerIdentifier ?? '',
    name: doc.name ?? '',
    avatar: doc.picture ?? '',
    status,
    targetId: doc.internalId ?? '',
  };
}

function toIntegrationDTOs(integrations) {
  return (integrations || []).map(toIntegrationDTO);
}

// Fields of a provider page/account object that are safe to send to the
// client. Everything else — notably `access_token` — stays server-side.
const PAGE_FIELDS = ['id', 'pageId', 'name', 'username'];

function sanitizePage(page) {
  if (!page) return null;
  const sanitized = {};
  for (const field of PAGE_FIELDS) {
    if (page[field] !== undefined && page[field] !== null) {
      sanitized[field] = page[field];
    }
  }
  const url =
    typeof page.picture === 'string' ? page.picture : page.picture?.data?.url;
  if (url) sanitized.picture = { data: { url } };
  return sanitized;
}

function sanitizePages(pages) {
  return (pages || []).map(sanitizePage);
}

export { toIntegrationDTO, toIntegrationDTOs, sanitizePage, sanitizePages };
