import { EventEmitter } from 'events';
import RingCentral from 'ringcentral';
import { Session } from './Session';
import { formatParty } from './formatParty';

export interface SessionsMap {
  [key: string]: any;
}

export interface SessionMessage {
  event: string;
  body: any;
}

export interface Device {
  id: string;
  linePooling: string;
  name: string;
  uri: string;
  type: 'SoftPhone' | 'OtherPhone' | 'HardPhone'
  serial: string;
  computerName: string;
  boxBillingId: Number;
  useAsCommonPhone: boolean;
  inCompanyNet: boolean;
  model: any;
  extension: any;
  emergencyServiceAddress: any;
  phoneLines: any[];
  shipping: any;
  sku: any;
  status: 'Initial' | 'Offline' | 'Online';
  site: any;
  lastLocationReportTime: string;
}

export interface Account {
  id: string;
}

export interface Extension {
  id: string;
  uri: string;
  account: Account;
  contact: any;
  departments: any[];
  extensionNumber: string;
  name: string;
  partnerId: string;
  permissions: any[];
  profileImage: any;
  references: any[];
  roles: any[];
  regionalSettings: any;
  serviceFeatures: any[];
  setupWizardState: string;
  status: string;
  statusInfo: string;
  type: string;
  callQueueExtensionInfo: any;
  hidden: boolean;
}

export interface CallOutToParams {
  phoneNumber?: string;
  extensionNumber?: string;
}

export class RingCentralCallControl extends EventEmitter {
  private _sdk: RingCentral;
  private _sessionsMap: SessionsMap;
  private _devices: Device[];
  private _currentExtension: Extension;
  private _accountLevel: boolean;

  constructor({ sdk, accountLevel } : { sdk: RingCentral, accountLevel: boolean }) {
    super();
    this._accountLevel = !!accountLevel;
    this._sdk = sdk;
    this._sessionsMap = new Map;
    this._devices = [];
    this.initialize();
  }

  private async initialize() {
    await this.loadCurrentExtension();
    await this.loadSessions();
    await this.loadDevices();
    this.emit('initialized');
  }

  public onNotificationEvent(message: SessionMessage) {
    if (message.event.indexOf('/telephony/sessions') === -1) {
      return;
    }
    const { eventTime, telephonySessionId, sessionId, ...newData } = message.body;
    if (!telephonySessionId) {
      return;
    }
    const existedSession = this._sessionsMap.get(telephonySessionId);
    newData.id = telephonySessionId;
    newData.extensionId = this.extensionId;
    newData.accountId = this.accountId;
    newData.parties = newData.parties.map(p => formatParty(p));
    if (!existedSession) {
      const disconnectedParties = newData.parties.filter(p => p.status.code === 'Disconnected');
      if (disconnectedParties.length === newData.parties.length) {
        return;
      }
      const newSession = new Session(newData, this._sdk, this._accountLevel);
      newSession.on('status', () => {
        this.onSessionStatusUpdated(newSession);
      });
      this._sessionsMap.set(telephonySessionId, newSession);
      if (newSession.party) {
        this.emit('new', newSession);
      }
      return;
    }
    const party = existedSession.party;
    existedSession.onUpdated(newData);
    if (!party && existedSession.party) {
      this.emit('new', existedSession);
    }
  }

  get sessions() {
    return Array.from(this._sessionsMap.values());
  }

  get sessionsMap() {
    return this._sessionsMap;
  }

  private async loadCurrentExtension() {
    try {
      const response = await this._sdk.platform().get('/account/~/extension/~');
      this._currentExtension = response.json();
    } catch (e) {
      console.error('Fetch presence error', e);
    }
  }

  private async loadSessions() {
    const activeCalls = await this.loadActiveCalls();
    await this.loadTelephoneSessions(activeCalls);
  }

  private async loadActiveCalls() {
    let presenceUrl = '/account/~/extension/~/presence?detailedTelephonyState=true&sipData=true';
    if (this._accountLevel) {
      presenceUrl = '/account/~/presence?detailedTelephonyState=true&sipData=true';
    }
    try {
      const response = await this._sdk.platform().get(presenceUrl);
      const data = response.json();
      if (this._accountLevel) {
        const presences = data.records;
        let activeCalls = [];
        presences.forEach((presence) => {
          if (presence.activeCalls) {
            activeCalls = activeCalls.concat(presence.activeCalls);
          }
        });
        return activeCalls;
      }

      return data.activeCalls || [];
    } catch (e) {
      console.error('Fetch presence error', e);
      return [];
    }
  }

  private async loadTelephoneSessions(activeCalls) {
    if (activeCalls.length === 0) {
      return;
    }
    try {
      await Promise.all(activeCalls.map(async (activeCall) => {
        const response = await this._sdk.platform().get(`/account/~/telephony/sessions/${activeCall.telephonySessionId}`);
        const data = response.json();
        data.extensionId = this.extensionId;
        data.accountId = this.accountId;
        data.parties = data.parties.map(p => formatParty(p));
        const session = new Session(data, this._sdk, this._accountLevel);
        this._sessionsMap.set(
          activeCall.telephonySessionId,
          session,
        );
        session.on('status', () => {
          this.onSessionStatusUpdated(session);
        });
      }));
    } catch (e) {
      console.error('load sessions error', e);
    }
  }

  private async loadDevices() {
    try {
      const response = await this._sdk.platform().get('/account/~/extension/~/device');
      const data = response.json();
      this._devices = data.records || [];
    } catch (e) {
      console.error('Fetch presence error', e);
    }
  }

  private onSessionStatusUpdated(session: Session) {
    const party = session.party;
    if (party && party.status.code === 'Disconnected') {
      this._sessionsMap.delete(session.id);
    }
  }

  public async refreshDevices() {
    await this.loadDevices();
  }

  public async createCall(deviceId: string, to: CallOutToParams) {
    const response = await this._sdk.platform().post('/account/~/telephony/call-out', {
      from: { deviceId },
      to,
    });
    const sessionData = response.json().session;
    sessionData.extensionId = this.extensionId;
    sessionData.accountId = this.accountId;
    sessionData.parties = sessionData.parties.map(p => formatParty(p));
    const session = new Session(sessionData, this._sdk, this._accountLevel);
    this._sessionsMap.set(
      sessionData.id,
      session,
    );
    session.on('status', () => {
      this.onSessionStatusUpdated(session);
    });
    return session;
  }

  // Fucntion to create conference session
  // The session's parties are empty
  // Join as HOST with voice by using webphone sdk to call session.voiceCallToken
  // Then bring in other telephony session into this conference
  public async createConference() {
    const response = await this._sdk.platform().post('/account/~/telephony/conference', {});
    const sessionData = response.json().session;
    sessionData.extensionId = this.extensionId;
    sessionData.accountId = this.accountId;
    sessionData.parties = (sessionData.parties || []).map(p => formatParty(p));
    const session = new Session(sessionData, this._sdk, this._accountLevel);
    this._sessionsMap.set(
      sessionData.id,
      session,
    );
    session.on('status', () => {
      this.onSessionStatusUpdated(session);
    });
    return session;
  }

  get accountId() {
    return this._currentExtension && String(this._currentExtension.account.id);
  }

  get extensionId() {
    return this._currentExtension && String(this._currentExtension.id);
  }

  get devices() {
    return this._devices;
  }
}
