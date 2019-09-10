import { Session } from '../src/Session';
import { formatParty } from '../src/formatParty';
import * as extensionInfo from './mock/data/extensionInfo.json';
import * as telephonySessionOutboundData from './mock/data/telephonySessionOutbound.json';
import * as telephonySessionInboundData from './mock/data/telephonySessionInbound.json';
import * as telephonyConferenceData from './mock/data/telephonyConference.json';

import * as mock from './mock/sdk';

let sdk;
let session;
describe('RingCentral Call Control :: Session', () => {
  beforeAll(async () => {
    mock.mockAuthentication();
    sdk = mock.createSDK();
    await sdk.platform().login({ username: '...', password: '...' });
    const data = {
      ...telephonySessionOutboundData,
      extensionId: String(extensionInfo.id),
      accountId: String(extensionInfo.account.id),
      parties: telephonySessionOutboundData.parties.map(p => formatParty(p))
    };
    session = new Session(data, sdk, false);
  });

  describe('Outbound', () => {
    beforeAll(() => {
      const data = {
        ...telephonySessionOutboundData,
        extensionId: String(extensionInfo.id),
        accountId: String(extensionInfo.account.id),
        parties: telephonySessionOutboundData.parties.map(p => formatParty(p))
      };
      session = new Session(data, sdk, false);
    });

    it('should initialize successfully', () => {
      expect(session.toJSON()).toEqual(session.data);
      expect(session.party.id).toEqual(telephonySessionOutboundData.parties[0].id);
      expect(session.party.direction).toEqual('Outbound');
      expect(session.otherParties.length).toEqual(1);
    });
  
    it('should mute successfully', async () => {
      mock.mockTelephoneSessionUpdateParty({ muted: true });
      const party = await session.mute();
      expect(party.muted).toEqual(true);
    });
  
    it('should unmute successfully', async () => {
      mock.mockTelephoneSessionUpdateParty({ muted: false });
      const party = await session.unmute();
      expect(party.muted).toEqual(false);
    });
  
    it('should hold successfully', async () => {
      mock.mockTelephoneSessionHoldParty();
      const party = await session.hold();
      expect(party.status.code).toEqual('Hold');
    });
  
    it('should unhold successfully', async () => {
      mock.mockTelephoneSessionUnholdParty();
      const party = await session.unhold();
      expect(party.status.code).toEqual('Answered');
    });
  
    it('should create recording successfully', async () => {
      mock.mockTelephoneSessionCreateRecording();
      const recording = await session.createRecord();
      expect(recording.active).toEqual(false);
    });
  
    it('should resume recording successfully', async () => {
      mock.mockTelephoneSessionUpdateRecording({ active: true });
      const recording = await session.resumeRecord('6962564004');
      expect(recording.active).toEqual(true);
    });
  
    it('should pause recording successfully', async () => {
      mock.mockTelephoneSessionUpdateRecording({ active: false });
      const recording = await session.pauseRecord('6962564004');
      expect(recording.active).toEqual(false);
    });
  
    it('should drop successfully', async () => {
      mock.mockTelephoneSessionDrop();
      await session.drop();
      const noException = true;
      expect(noException).toEqual(true);
    });

    it('should transfer successfully', async () => {
      mock.mockTelephoneSessionTransferParty();
      const party = await session.transfer({ phoneNumber: '+1234567890' });
      expect(party.status.reason).toEqual('BlindTransfer');
    });
  })

  describe('Inbound', () => {
    beforeAll(() => {
      const data = {
        ...telephonySessionInboundData,
        extensionId: String(extensionInfo.id),
        accountId: String(extensionInfo.account.id),
        parties: telephonySessionInboundData.parties.map(p => formatParty(p))
      };
      session = new Session(data, sdk, false);
    });

    it('should initialize successfully', () => {
      expect(session.party.direction).toEqual('Inbound');
    });

    it('should reject successfully', async () => {
      mock.mockTelephoneSessionRejectParty();
      await session.toVoicemail();
      const noException = true;
      expect(noException).toEqual(true);
    });

    it('should foward successfully', async () => {
      mock.mockTelephoneSessionForwardParty();
      const party = await session.forward({ phoneNumber: '+1234567890' });
      expect(party.status.reason).toEqual('BlindTransfer');
    });
  });

  describe('AccountLevel', () => {
    beforeAll(() => {
      const data = {
        ...telephonySessionOutboundData,
        extensionId: String(extensionInfo.id),
        accountId: String(extensionInfo.account.id),
        parties: telephonySessionOutboundData.parties.map(p => formatParty(p))
      };
      session = new Session(data, sdk, true);
    });

    it('should initialize successfully', () => {
      expect(session.party.id).toEqual(telephonySessionOutboundData.parties[0].id);
    });
  });

  describe('Conference', () => {
    beforeAll(() => {
      const data = {
        ...telephonyConferenceData.session,
        extensionId: String(extensionInfo.id),
        accountId: String(extensionInfo.account.id),
        parties: telephonyConferenceData.session.parties.map(p => formatParty(p))
      };
      session = new Session(data, sdk, true);
    });

    it('should initialize successfully', () => {
      expect(session.voiceCallToken).toEqual(telephonyConferenceData.session.voiceCallToken);
    });

    it('should bring-in party successfully', async () => {
      mock.mockTelephoneSessionBringInParty();
      const party = await session.bringInParty({ partyId: '111', sessionId: '1111' });
      expect(party.conferenceRole).toEqual('Participant');
    });

    it('should remove party successfully', async () => {
      mock.mockTelephoneSessionRemoveParty();
      await session.removeParty('111');
      const noException = true;
      expect(noException).toEqual(true);
    });
  });
});
