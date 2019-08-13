export function formatParty({ owner, ...party }) {
  if (!owner) {
    if (!party.extensionId && party.accountId) {
      delete party.accountId;
    } else if (party.extensionId && party.accountId) {
      party.extensionId = String(party.extensionId);
      party.accountId = String(party.accountId);
    }
    return party;
  }
  party.extensionId = String(owner.extensionId);
  party.accountId = String(owner.accountId);
  return party;
}
