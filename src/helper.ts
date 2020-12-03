
import { Session, SessionData, Direction as callDirections } from './Session';

function ringOutInboundLegCheck(newData: SessionData, sessionMap: any) {
    const allSessions: Session[] = Array.from(sessionMap.values());
    const { parties = [], origin = { type: 'Call' } } = newData || {};
    const party = parties[0];
    const checkResult = {
        isRingOutInboundLeg: false,
        legSessionId: null,
    };
    if (!party || origin.type === 'Call' && party.direction === callDirections.outbound) {
        return checkResult;
    }
    if (allSessions.length) {
        for (const session of allSessions) {
            const sessionIdGap = parseInt(newData.sessionId, 10) - parseInt(session.sessionId, 10);
            const { party: existedSessionParty } = session;
            switch (sessionIdGap) {
                case 1000:
                case 2000:
                case 3000:
                case 4000: {
                    if (party.direction === callDirections.inbound && party.from && party.to &&
                        existedSessionParty.from && existedSessionParty.to && (party.from.phoneNumber === existedSessionParty.to.phoneNumber) &&
                        (party.to.phoneNumber === existedSessionParty.from.phoneNumber)) {
                        checkResult.isRingOutInboundLeg = true;
                    }
                    break;
                }
                case -1000:
                case -2000:
                case -3000:
                case -4000: {
                    if (party.direction === callDirections.outbound && party.from && party.to &&
                        existedSessionParty.from && existedSessionParty.to && (party.from.phoneNumber === existedSessionParty.to.phoneNumber) &&
                        (party.to.phoneNumber === existedSessionParty.from.phoneNumber)) {
                        checkResult.isRingOutInboundLeg = false;
                        checkResult.legSessionId = session.id;
                    }
                    break;
                }
                default:
                    break;
            }
        }
    }
    return checkResult;
}

export { ringOutInboundLegCheck };
