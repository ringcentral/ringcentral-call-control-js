
import { Session, SessionData, Direction as callDirections } from './Session';

export function isRingOutInboundLeg(newData: SessionData, allSessions: Session[]) {
    let isRingOutLeg = false;
    const { parties = [] } = newData || {};
    const inboundParty = parties.find(
        (party) => party.direction === callDirections.inbound,
    );
    if (!inboundParty || !Array.isArray(allSessions) || !allSessions.length) {
        return isRingOutLeg;
    }
    const ringOutSessions = allSessions.filter(
        (s: Session) =>
            s.party.direction === callDirections.outbound &&
            s.party.ringOutRole === 'Initiator',
    );
    if (ringOutSessions.length) {
        for (const outbound of ringOutSessions) {
            const { party: outboundParty } = outbound;
            switch (
            Math.abs(parseInt(newData.sessionId, 10) - parseInt(outbound.sessionId, 10))
            ) {
                case 1000:
                case 2000:
                case 3000:
                case 4000: {
                    if (
                        inboundParty.from &&
                        inboundParty.to &&
                        outboundParty &&
                        outboundParty.from &&
                        outboundParty.to &&
                        (inboundParty.from.phoneNumber === outboundParty.to.phoneNumber) &&
                        (inboundParty.to.phoneNumber === outboundParty.from.phoneNumber)
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
