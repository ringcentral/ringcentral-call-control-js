import { isValidNumber, formatNumber, parseNumber } from "libphonenumber-js";
import { Direction as callDirections } from "./Session";
import { Session, SessionData } from "./Session";
export function isInbound(call: { direction?: string } = {}) {
  return call.direction === callDirections.inbound;
}

export function isOutbound(call: { direction?: string } = {}) {
  return call.direction === callDirections.outbound;
}

export default function isSameLocalNumber(a = "", b = "") {
  if (a === b) {
    return true;
  }
  if (isValidNumber(a)) {
    return (
      formatNumber(parseNumber(a) as any, "National").replace(/[^\d]/g, "") ===
      b
    );
  }
  if (isValidNumber(b)) {
    return (
      formatNumber(parseNumber(b) as any, "National").replace(/[^\d]/g, "") ===
      a
    );
  }
  return false;
}

export function areTwoLegs(newData: SessionData, allSessions: Session[]) {
  const ringOutSessions = allSessions.filter(
    (s) =>
      s.party.direction === callDirections.outbound &&
      s.party.ringOutRole === "Initiator",
  );
  const { parties = [] } = newData || {};
  const inboundParty = parties.find(
    (party) => party.direction === callDirections.inbound,
  );
  let isRingOutLeg = false;
  if (ringOutSessions.length && inboundParty) {
    for (const outbound of ringOutSessions) {
      const { party: outboundParty } = outbound;
      switch (
      Math.abs(parseInt(newData.sessionId) - parseInt(outbound.sessionId))
      ) {
        case 1000:
        case 2000:
        case 3000:
        case 4000: {
          if (
            inboundParty.from &&
            inboundParty.to &&
            outboundParty.from &&
            outboundParty.to &&
            isSameLocalNumber(
              inboundParty.from.phoneNumber,
              outboundParty.to.phoneNumber,
            ) &&
            isSameLocalNumber(
              inboundParty.to.phoneNumber,
              outboundParty.from.phoneNumber,
            )
          ) {
            isRingOutLeg = true;
          }
          break;
        }
        default:
          break;
      }
      if (isRingOutLeg) {
        break;
      }
    }
  }
  return isRingOutLeg;
}
