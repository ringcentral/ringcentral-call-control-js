import { EventEmitter } from 'events';
import { SDK as RingCentralSDK } from '@ringcentral/sdk';
import { Session, SessionData, PartyStatusCode } from './Session';
import { formatParty } from './formatParty';
import { USER_AGENT } from './userAgent';

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
  private _sdk: RingCentralSDK;
  private _sessionsMap: SessionsMap;
  private _devices: Device[];
  private _currentExtension: Extension;
  private _accountLevel: boolean;
  private _ready: boolean;
  private _initializePromise: any;
  private _preloadSessions: boolean;
  private _preloadDevices: boolean;
  private _userAgent: string;

  constructor({
    sdk,
    accountLevel,
    preloadSessions = true,
    preloadDevices = true,
    extensionInfo,
    userAgent,
  } : {
    sdk: RingCentralSDK,
    accountLevel?: boolean,
    preloadSessions?: boolean,
    preloadDevices?: boolean,
    extensionInfo?: Extension,
    userAgent?: string,
  }) {
    super();
    this._accountLevel = !!accountLevel;
    this._sdk = sdk;
    this._userAgent = userAgent;
    this._sessionsMap = new Map;
    this._devices = [];
    this._ready = false;
    this._initializePromise = null;
    this._preloadSessions = preloadSessions;
    this._preloadDevices = preloadDevices;
    this._currentExtension = extensionInfo;
    this.initialize();
  }

  public async initialize() {
    if (this._ready) {
      return;
    }
    if (!this._initializePromise) {
      this._initializePromise = this._initialize();
    }
    await this._initializePromise;
    this._initializePromise = null;
  }

  private async _initialize() {
    if (!this._currentExtension) {
      await this.loadCurrentExtension();
    }
    if (this._preloadSessions) {
      await this.preloadSessions();
    }
    if (this._preloadDevices) {
      await this.loadDevices();
    }
    this._ready = true;
    this.emit('initialized');
  }

  public onNotificationEvent(message: SessionMessage) {
    if (message.event.indexOf('/telephony/sessions') === -1) {
      return;
    }
    const { eventTime, telephonySessionId, ...newData } = message.body;
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
      // use first event's eventTime as session creationTime
      newData.creationTime = eventTime;
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
      const response =
        await this._sdk.platform().get('/restapi/v1.0/account/~/extension/~', null, this.requestOptions);
      this._currentExtension = await response.json();
    } catch (e) {
      console.error('Fetch presence error', e);
    }
  }

  private async preloadSessions() {
    const activeCalls = await this.loadActiveCalls();
    await this.loadSessions(activeCalls);
  }

  private async loadActiveCalls() {
    let presenceUrl = '/restapi/v1.0/account/~/extension/~/presence?detailedTelephonyState=true&sipData=true';
    if (this._accountLevel) {
      presenceUrl = '/restapi/v1.0/account/~/presence?detailedTelephonyState=true&sipData=true';
    }
    try {
      const response = await this._sdk.platform().get(presenceUrl, null, this.requestOptions);
      const data = await response.json();
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

  public async loadSessions(activeCalls) {
    if (activeCalls.length === 0) {
      return;
    }
    try {
      await Promise.all(activeCalls.map(async (activeCall) => {
        const response =
          await this._sdk.platform().get(
            `/restapi/v1.0/account/~/telephony/sessions/${activeCall.telephonySessionId}`,
            null,
            this.requestOptions,
          );
        const data = await response.json();
        data.extensionId = this.extensionId;
        data.accountId = this.accountId;
        data.parties = data.parties.map(p => formatParty(p));
        // since call session status API not provide the `sessionId`, so pick from presence here.
        data.sessionId = activeCall.sessionId;
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

  public restoreSessions(sessionDatas: SessionData[]) {
    const oldSessionMap = this._sessionsMap;
    this._sessionsMap = new Map();
    sessionDatas.forEach((sessionData) => {
      if (oldSessionMap.get(sessionData.id)) {
        const oldSession = oldSessionMap.get(sessionData.id);
        oldSession.restore(sessionData);
        this._sessionsMap.set(sessionData.id, oldSession);
        return;
      }
      this._sessionsMap.set(
        sessionData.id,
        new Session(sessionData, this._sdk, this._accountLevel)
      );
    });
  }

  private async loadDevices() {
    try {
      const response =
        await this._sdk.platform().get(
          '/restapi/v1.0/account/~/extension/~/device',
          null,
          this.requestOptions,
        );
      const data = await response.json();
      this._devices = data.records || [];
    } catch (e) {
      console.error('Fetch presence error', e);
    }
  }

  private onSessionStatusUpdated(session: Session) {
    const party = session.party;
    if (
      party &&
      party.status.code === PartyStatusCode.disconnected &&
      party.status.reason !== 'Pickup' && // don't end when call switched
      party.status.reason !== 'CallSwitch' // don't end when call switched
    ) {
      this._sessionsMap.delete(session.id);
    }
  }

  public async refreshDevices() {
    await this.loadDevices();
  }

  public async createCall(deviceId: string, to: CallOutToParams) {
    const response = await this._sdk.platform().post('/restapi/v1.0/account/~/telephony/call-out', {
      from: { deviceId },
      to,
    }, null, this.requestOptions);
    const sessionData = (await response.json()).session;
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
    const response =
      await this._sdk.platform().post(
        '/restapi/v1.0/account/~/telephony/conference',
        {},
        null,
        this.requestOptions
      );
    const sessionData = (await response.json()).session;
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

  get ready() {
    return this._ready;
  }

  get requestOptions() {
    return {
      userAgent: this._userAgent ? `${this._userAgent} ${USER_AGENT}` : USER_AGENT,
    };
  }
}
