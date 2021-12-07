import { RingCentralCallControl } from '../src/index';
import { USER_AGENT } from '../src/userAgent';
import * as mock from './mock/sdk';
import * as extensionInfo from './mock/data/extensionInfo.json';
import * as telephonySessionInboundProceedingMessage from './mock/data/telephonySessionInboundProceedingMessage.json';
import * as telephonySessionOutboundSetupMessage from './mock/data/telephonySessionOutboundSetupMessage.json';
import * as telephonySessionOutboundDisconnectedMessage from './mock/data/telephonySessionOutboundDisconnectedMessage.json';
import * as telephonySessionOutboundData from './mock/data/telephonySessionOutbound.json';

let sdk;
let rcCallControl;

function getMockEventMessage({
  template,
  telephonySessionId,
  sequence,
  code,
  reason,
  party;
}: {
  template: any;
  telephonySessionId?: string;
  sequence?: number;
  code?: string;
  reason?: string;
  party?: any;
}) {
  let partyData = party || template.body.parties[0];
  return {
    ...template,
    body: {
      ...template.body,
      telephonySessionId: telephonySessionId || template.body.telephonySessionId,
      sequence: sequence || template.body.sequence,
      parties: [{
        ...partyData,
        status: {
          ...partyData.status,
          code: code || partyData.status.code,
          reason: reason || partyData.status.reason,
        },
      }]
    },
  };
}

describe('RingCentral Call Control :: Index', () => {
  beforeAll(async () => {
    mock.mockAuthentication();
    sdk = mock.createSDK();
    await sdk.platform().login({ username: '...', password: '...' });
  });

  describe('Initialize', () => {
    beforeAll(async () => {
      mock.mockDevice();
      mock.mockExtensionInfo();
      mock.mockPresence();
      mock.mockTelephoneSession();
      rcCallControl = new RingCentralCallControl({ sdk });
      await rcCallControl.initialize();
    });
  
    it('should be ready after initialized', () => {
      expect(rcCallControl.ready).toEqual(true);
    });

    it('should have default userAgent after initialized', () => {
      expect(rcCallControl.requestOptions.userAgent).toEqual(USER_AGENT);
    });

    it('should not initialize duplicate', () => {
      rcCallControl.initialize();
      expect(rcCallControl._initializePromise).toEqual(null);
    });
  
    it('should load devices after initialized', () => {
      expect(rcCallControl.devices.length).toEqual(1);
    });
  
    it('should load sessions after initialized', () => {
      expect(rcCallControl.sessions.length).toEqual(1);
      expect(Array.from(rcCallControl.sessionsMap.keys()).length).toEqual(1);
    });

    it('should delete session after get disconnected event', () => {
      rcCallControl.onNotificationEvent(telephonySessionOutboundDisconnectedMessage);
      expect(rcCallControl.sessions.length).toEqual(0);
    });
  
    it('should load extensionInfo after initialized', () => {
      expect(rcCallControl.extensionId).toEqual(String(extensionInfo.id));
      expect(rcCallControl.accountId).toEqual(String(extensionInfo.account.id));
    });
  
    it('should refresh devices successfully', async () => {
      mock.mockDevice({ records: [] });
      await rcCallControl.refreshDevices();
      expect(rcCallControl.devices.length).toEqual(0);
      mock.mockDevice();
      await rcCallControl.refreshDevices();
      expect(rcCallControl.devices.length).toEqual(1);
    });
  });

  describe('Initialize without preload', () => {
    beforeAll(async () => {
      rcCallControl = new RingCentralCallControl({
        sdk,
        preloadDevices: false,
        preloadSessions: false,
        extensionInfo: extensionInfo as any,
      });
      await rcCallControl.initialize();
    });

    it('should be ready after initialized', () => {
      expect(rcCallControl.ready).toEqual(true);
      expect(rcCallControl.devices.length).toEqual(0);
      expect(rcCallControl.sessions.length).toEqual(0);
      expect(rcCallControl.extensionId).toEqual(String(extensionInfo.id));
      expect(rcCallControl.accountId).toEqual(String(extensionInfo.account.id));
    });
  });

  describe('Initialize with API failed', () => {
    beforeAll(async () => {
      rcCallControl = new RingCentralCallControl({ sdk });
      await rcCallControl.initialize();
    });

    it('should be ready after initialized', () => {
      expect(rcCallControl.ready).toEqual(true);
    });
  });

  describe('Initialize with User Agent', () => {
    beforeAll(async () => {
      rcCallControl = new RingCentralCallControl({ sdk, userAgent: 'TestAgent' });
      await rcCallControl.initialize();
    });

    it('should be ready after initialized', () => {
      expect(rcCallControl.requestOptions.userAgent).toEqual(`TestAgent ${USER_AGENT}`);
    });
  });

  describe('Restore sessions', () => {
    it('should restore session as new session', async () => {
      const callControl = new RingCentralCallControl({
        sdk,
        preloadDevices: false,
        preloadSessions: false,
        extensionInfo: extensionInfo as any,
      });
      await callControl.initialize();
      expect(callControl.sessions.length).toEqual(0);
      callControl.restoreSessions([
        {
          ...telephonySessionOutboundData,
          extensionId: String(extensionInfo.id),
          accountId: String(extensionInfo.account.id),
        }
      ]);
      expect(callControl.sessions.length).toEqual(1);
    });

    it('should restore session with existed session', async () => {
      mock.mockPresence();
      mock.mockTelephoneSession();
      const callControl = new RingCentralCallControl({
        sdk,
        preloadDevices: false,
        extensionInfo: extensionInfo as any,
      });
      await callControl.initialize();
      expect(callControl.sessions.length).toEqual(1);
      const oldSession = callControl.sessions[0];
      callControl.restoreSessions([
        {
          ...telephonySessionOutboundData,
          extensionId: String(extensionInfo.id),
          accountId: String(extensionInfo.account.id),
        }
      ]);
      expect(callControl.sessions.length).toEqual(1);
      expect(callControl.sessions[0]).toEqual(oldSession);
    });
  });

  describe('Notification Event', () => {
    beforeAll(async () => {
      mock.mockDevice();
      mock.mockExtensionInfo()
      mock.mockPresence({ activeCalls: [] });
      mock.mockTelephoneSession();
      rcCallControl = new RingCentralCallControl({ sdk });
      await rcCallControl.initialize();
    });

    it('should load empty sessions firstly', () => {
      expect(rcCallControl.sessions.length).toEqual(0);
    });

    it('should not handle no telephony session event', () => {
      rcCallControl.onNotificationEvent({
        event: '/restapi/v1.0/account/170848004/telephony/sessions',
        body: {}
      });
      expect(rcCallControl.sessions.length).toEqual(0);
    });

    it('should not handle no telephony session id', () => {
      rcCallControl.onNotificationEvent({ event: '/restapi/v1.0/account/170848004/extension/170848004' });
      expect(rcCallControl.sessions.length).toEqual(0);
    });

    it('should not create new sessions when get telephony session disconnected event', () => {
      let newEventTriggered = false;
      rcCallControl.once('new', () => {
        newEventTriggered = true;
      });
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionOutboundDisconnectedMessage,
        telephonySessionId: '12345',
      }));
      expect(rcCallControl.sessions.length).toEqual(0);
      expect(newEventTriggered).toEqual(false);
    });

    it('should create new sessions and new event when get telephony session event', () => {
      let newEventTriggered = false;
      rcCallControl.once('new', () => {
        newEventTriggered = true;
      });
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionOutboundSetupMessage,
        telephonySessionId: '123456',
      }));
      expect(rcCallControl.sessions.length).toEqual(1);
      expect(rcCallControl.sessions[0].parties.length).toEqual(1);
      expect(newEventTriggered).toEqual(true);
    });

    it('should update session when get telephony session updated event', () => {
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionInboundProceedingMessage,
        telephonySessionId: '123456',
      }));
      expect(rcCallControl.sessions.length).toEqual(1);
      expect(rcCallControl.sessions[0].parties.length).toEqual(2);
    });

    it('should not update session when get telephony session with outdated sequence', () => {
      const oldStatus = rcCallControl.sessions[0].party.status;
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionInboundProceedingMessage,
        telephonySessionId: '123456',
        sequence: telephonySessionInboundProceedingMessage.body.sequence - 1,
        code: 'Disconnected',
      }));
      expect(rcCallControl.sessions.length).toEqual(1);
      expect(rcCallControl.sessions[0].party.status.code).toEqual(oldStatus.code);
    });

    it('should not update session when get telephony session no updated event', () => {
      const oldStatus = rcCallControl.sessions[0].party.status;
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionInboundProceedingMessage,
        telephonySessionId: '123456',
      }));
      expect(rcCallControl.sessions.length).toEqual(1);
      expect(rcCallControl.sessions[0].party.status.code).toEqual(oldStatus.code);
    });

    it('should not delete session when get telephony session disconnected event with pickup reason', () => {
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionOutboundDisconnectedMessage,
        telephonySessionId: '123456',
        reason: 'Pickup',
      }));
      expect(rcCallControl.sessions.length).toEqual(1);
      expect(rcCallControl.sessions[0].party).toEqual(undefined);
    });

    it('should delete session when get telephony session disconnected event', () => {
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionOutboundDisconnectedMessage,
        telephonySessionId: '123456',
      }));
      expect(rcCallControl.sessions.length).toEqual(0);
    });

    it('should not add session after get telephony session Setup event with wrong sequence', () => {
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionOutboundDisconnectedMessage,
        telephonySessionId: '1234567',
        sequence: 3,
      }));
      expect(rcCallControl.sessions.length).toEqual(0);
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionOutboundSetupMessage,
        telephonySessionId: '1234567',
        sequence: 2,
      }));
      expect(rcCallControl.sessions.length).toEqual(0);
    });

    it('should emit new event when get telephony session first my party', () => {
      let newEventTriggered = false;
      rcCallControl.once('new', () => {
        newEventTriggered = true;
      });
      const notPartiesMessage = getMockEventMessage({
        template: telephonySessionOutboundSetupMessage,
        telephonySessionId: '12345678',
        party: {
          ...telephonySessionInboundProceedingMessage.body.parties[0],
        }
      });
      rcCallControl.onNotificationEvent(notPartiesMessage);
      expect(rcCallControl.sessions.length).toEqual(1);
      expect(!!rcCallControl.sessions[0].party).toEqual(false);
      expect(rcCallControl.sessions[0].otherParties.length).toEqual(1);
      expect(rcCallControl.sessions[0].parties.length).toEqual(1);
      expect(newEventTriggered).toEqual(false);
      rcCallControl.onNotificationEvent(getMockEventMessage({
        template: telephonySessionOutboundSetupMessage,
        telephonySessionId: '12345678',
      }));
      expect(newEventTriggered).toEqual(true);
    });
  });

  describe('Create call', () => {
    beforeAll(async () => {
      mock.mockDevice();
      mock.mockExtensionInfo()
      mock.mockPresence({ activeCalls: [] });
      mock.mockTelephoneSession();
      rcCallControl = new RingCentralCallControl({ sdk });
      await rcCallControl.initialize();
    });

    it('should create call session successfully', async () => {
      mock.mockTelephoneSessionCallOut();
      const deviceId = rcCallControl.devices.filter(d => d.status === 'Online')[0].id;
      const session = await rcCallControl.createCall(deviceId, { phoneNumber: '+12345678900' });
      expect(rcCallControl.sessions.length).toEqual(1);
      expect(rcCallControl.sessions[0].id).toEqual(session.id);
    });

    it('should delete call when get disconnected event', async () => {
      rcCallControl.onNotificationEvent(telephonySessionOutboundDisconnectedMessage);
      expect(rcCallControl.sessions.length).toEqual(0);
    });
  });

  describe('Create conference', () => {
    beforeAll(async () => {
      mock.mockDevice();
      mock.mockExtensionInfo()
      mock.mockPresence({ activeCalls: [] });
      mock.mockTelephoneSession();
      rcCallControl = new RingCentralCallControl({ sdk });
      await rcCallControl.initialize();
    });

    it('should create conference successfully', async () => {
      mock.mockTelephoneConference();
      const session = await rcCallControl.createConference();
      expect(rcCallControl.sessions.length).toEqual(1);
      expect(rcCallControl.sessions[0].parties.length).toEqual(0);
    });
  });

  describe('Account Level', () => {
    beforeAll(async () => {
      mock.mockDevice();
      mock.mockExtensionInfo()
      mock.mockAccountPresence();
      mock.mockTelephoneSession();
      rcCallControl = new RingCentralCallControl({ sdk, accountLevel: true });
      await rcCallControl.initialize();
    });

    it('should load active calls successfully', async () => {
      expect(rcCallControl.sessions.length).toEqual(1);
    });
  });
});
