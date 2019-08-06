import { EventEmitter } from 'events';
import RingCentral from 'ringcentral';
import Session from './Session';
import formatParty from './formatParty';

interface SessionsMap {
  [key: string]: any;
}

export default class RingCentralCallControl extends EventEmitter {
  private _sdk: RingCentral;
  private _sessionsMap: SessionsMap;
  private _devices: any[];
  private _eventSequence: Number;
  private _currentExtension: any;

  constructor({ sdk } : { sdk: RingCentral }) {
    super();
    this._sdk = sdk;
    this._sessionsMap = new Map;
    this._eventSequence = null;
    this.initialize();
  }

  private async initialize() {
    await this.loadCurrentExtension();
    await this.loadSessions();
    await this.loadDevices();
  }

  public onNotificationEvent(message: any) {
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
      const newSession = new Session(newData, this._sdk);
      newSession.on('status', () => {
        this.onSessionStatusUpdated(newSession);
      });
      this._sessionsMap.set(telephonySessionId, newSession);
      console.log('event:', 'new', JSON.stringify(newSession, null, 2));
      this.emit('new', newSession);
      return;
    }
    existedSession.onUpdated(newData);
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
    try {
      const response = await this._sdk.platform().get('/account/~/extension/~/presence?detailedTelephonyState=true&sipData=true');
      const data = response.json();
      return data.activeCalls || [];
    } catch (e) {
      console.error('Fetch presence error', e);
    }
  }

  private async loadTelephoneSessions(activeCalls) {
    if (activeCalls.length === 0) {
      return;
    }
    await Promise.all(activeCalls.map(async (activeCall) => {
      const response = await this._sdk.platform().get(`/account/~/telephony/sessions/${activeCall.telephonySessionId}`);
      const data = response.json();
      data.extensionId = this.extensionId;
      data.accountId = this.accountId;
      data.parties = data.parties.map(p => formatParty(p));
      this._sessionsMap.set(
        activeCall.telephonySessionId,
        new Session(data, this._sdk)
      );
    }));
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

  private onSessionStatusUpdated(session) {
    const party = session.party;
    if (party && party.status.code === 'Disconnected') {
      this._sessionsMap.delete(session.telephonySessionId);
    }
  }

  public async refreshDevices() {
    await this.loadDevices();
  }

  public async createCall(deviceId, to) {
    const response = await this._sdk.platform().post('/account/~/telephony/call-out', {
      from: { deviceId },
      to,
    });
    const sessionData = response.json().session;
    const session = new Session(sessionData, this._sdk);
    this._sessionsMap.set(
      sessionData.id,
      session,
    );
    return session;
  }

  get accountId() {
    return this._currentExtension && String(this._currentExtension.account.id);
  }

  get extensionId() {
    return this._currentExtension && String(this._currentExtension.id);
  }
}
