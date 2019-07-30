import RingCentral from 'ringcentral';

interface SessionsMap {
  [key: string]: any;
}

export default class RingCentralCallControl {
  private _sdk: RingCentral;
  private _activeCalls: any[];
  private _sessionsMap: SessionsMap;

  constructor({ sdk } : { sdk: RingCentral }) {
    this._sdk = sdk;
    this._activeCalls = [];
    this._sessionsMap = new Map;
    this._initialize();
  }

  async _initialize() {
    await this.loadSessions();
  }

  onTelephoneSessionsEvent(message) {
    console.log(message);
  }

  get sessions() {
    return this._activeCalls.map(({ telephonySessionId, ...activeCall }) => {
      return {
        ...activeCall,
        ...this._sessionsMap.get(telephonySessionId),
      }
    });
  }

  async loadSessions() {
    await this._loadActiveCalls();
    await this._loadTelephoneSessions();
  }

  async _loadActiveCalls() {
    try {
      const response = await this._sdk.platform().get('/account/~/extension/~/presence?detailedTelephonyState=true&sipData=true');
      const data = response.json();
      if (data.activeCalls) {
        this._activeCalls = data.activeCalls;
      }
    } catch (e) {
      console.error('Fetch presence error', e);
    }
  }

  async _loadTelephoneSessions() {
    if (this._activeCalls.length === 0) {
      return;
    }
    await Promise.all(this._activeCalls.map(async (activeCall) => {
      const response = await this._sdk.platform().get(`/account/~/telephony/sessions/${activeCall.telephonySessionId}`);
      const data = response.json();
      this._sessionsMap.set(activeCall.telephonySessionId, data);
    }));
  }

  createCall() {

  }

  drop() {

  }

  reject() {

  }

  hold() {

  }

  unhold() {

  }

  flip() {

  }

  createRecording() {

  }

  pauseRecording() {

  }

  resumeRecording() {

  }

  supervise() {

  }
}
