import { EventEmitter } from "events";

function objectEqual(obj1, obj2) {
  let equal = true;
  if (!obj1 || !obj2) {
    return false;
  }
  Object.keys(obj2).forEach((key) => {
    if (obj2[key] === obj1[key]) {
      return;
    }
    equal = false;
  });
  Object.keys(obj1).forEach((key) => {
    if (obj1[key] === obj2[key]) {
      return;
    }
    equal = false;
  });
  return equal;
}

function diffParty(oldParty, updatedParty) {
  const diffs = [];
  updatedParty && Object.keys(updatedParty).forEach((key) => {
    if (updatedParty[key] === oldParty[key]) {
      return;
    }
    if (typeof updatedParty[key] !== 'object') {
      diffs.push({ type: key, value: updatedParty[key] });
      return;
    }
    if (objectEqual(updatedParty[key], oldParty[key])) {
      return;
    }
    diffs.push({ key, value: updatedParty[key] });
  })
  return diffs;
}

function diffParties(oldParties: any, updatedParties: any) {
  const oldMap = {};
  oldParties.forEach((p) => {
    oldMap[p.id] = p;
  });
  const diffs = [];
  updatedParties.forEach((updatedParty) => {
    if (!oldMap[updatedParty.id]) {
      diffs.push({ type: 'new', party: updatedParty });
      return;
    }
    const oldParty = oldMap[updatedParty.id];
    const partyDiffs= diffParty(oldParty, updatedParty);
    if (partyDiffs.length === 0) {
      return;
    }
    diffs.push({ type: 'update', party: updatedParty, partyDiffs });
  });
  return diffs;
}

export default class Session extends EventEmitter {
  private _data: any;
  private _eventSequence: Number;
  private _sdk: any;

  constructor(rawData: any, sdk: any) {
    super();
    const { sequence, ...data } = rawData;
    this._data = data;
    this._eventSequence = sequence;
    this._sdk = sdk;

    return new Proxy(this, {
      get(target, name, receiver) {
        if (!Reflect.has(target, name)) {
          return target._data[name];
        }
        return Reflect.get(target, name, receiver);
      },
    });
  }

  public onUpdated(data) {
    if (!this._eventSequence || data.sequence < this._eventSequence) {
      this._eventSequence = data.sequence;
    }
    const partiesDiff =  diffParties(this._data.parties, data.parties);
    partiesDiff.forEach((diff) => {
      if (diff.type === 'new') {
        this._data.parties = [].concat(this._data.parties).concat(diff.party);
        this.emit('status', { party: diff.party });
        return;
      }
      if (this._eventSequence && data.sequence < this._eventSequence) {
        return;
      }
      if (diff.type === 'update') {
        const oldPartyIndex = this._data.parties.findIndex(p => p.id === diff.party.id);
        const parties = this._data.parties.slice(0);
        parties[oldPartyIndex] = {
          ...parties[oldPartyIndex],
          ...diff.party,
        }
        this._data.parties = parties;
        diff.partyDiffs.forEach((partyDiff) => {
          console.log('event:', partyDiff.key, diff.party)
          this.emit(partyDiff.key, { party: diff.party });
        });
        return;
      }
    });
  }

  get party() {
    const extensionId = this._data.extensionId;
    return this._data.parties.find(p => p.extensionId === extensionId);
  }

  toJSON() {
    return this._data;
  }

  async drop() {
    await this._sdk.platform().delete(
      `/account/~/telephony/sessions/${this._data.id}`
    );
  }

  async hold() {
    const oldParty = this.party;
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${oldParty.id}/hold`
    );
    const newParty = response.json();
    return newParty;
  }

  async unhold() {
    const oldParty = this.party;
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${oldParty.id}/unhold`
    );
    const newParty = response.json();
    return newParty;
  }

  async reject() {
    await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/reject`
    );
  }

  async forward(params: ForwardParams) {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/forward`,
      params
    );
    return response.json();
  }

  async transfer(params: TransferParams) {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/transfer`,
      params
    );
    return response.json();
  }

  async toVoicemail() {
    const result = await this.forward({ voicemail: this._data.extensionId });
    return result;
  }

  async flip(params: FlipParams) {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/flip`,
      params
    );
    return response.json();
  }

  async updateParty(params: PartyParams) {
    const response = await this._sdk.platform().patch(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}`,
      params
    );
    return response.json();
  }

  async mute() {
    const result = await this.updateParty({ muted: true });
    return result;
  }

  async unmute() {
    const result = await this.updateParty({ muted: false });
    return result;
  }

  async createRecord() {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/recordings`,
    );
    return response.json();
  }

  async updateRecord(params: RecordParams) {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/recordings/${params.id}`,
      {
        active: params.active,
      }
    );
    return response.json();
  }

  async pauseRecord(id: string) {
    const result = await this.updateRecord({ id, active: false });
    return result;
  }

  async resumeRecord(id: string) {
    const result = await this.updateRecord({ id, active: true });
    return result;
  }

  async supervise(params: SuperviseParams) {
    const response = await this._sdk.platform().patch(
      `/account/~/telephony/sessions/${this._data.id}/supervise`,
      params
    );
    return response.json();
  }
}

export enum Direction {
  inbound = 'Inbound',
  outbound = 'Outbound'
}

export enum PartyStatusCode {
  setup = 'Setup', 
  proceeding = 'Proceeding', 
  answered = 'Answered', 
  disconnected = 'Disconnected', 
  gone = 'Gone', 
  parked = 'Parked', 
  hold = 'Hold', 
  voicemail = 'VoiceMail', 
  faxReceive = 'FaxReceive', 
  voicemailScreening = 'VoiceMailScreening'
}

export interface PartyToFrom {
  phoneNumber?: string;
  name?: string;
  extensionId?: string;
  extensionNumber?: string;
}

export interface PartyStatus {
  code?: PartyStatusCode;
}

export interface Recording {
  id: string;
  active: boolean;
}

export interface Party {
  id: string;
  extensionId?: string;
  accountId?: string;
  direction: Direction;
  to: PartyToFrom;
  from: PartyToFrom;
  status: PartyStatus;
  missedCall: boolean;
  standAlone: boolean;
  muted: boolean;
  conferenceRole?: 'Host' | 'Participant';
  ringOutRole?: 'Initiator' | 'Target';
  ringMeRole?: 'Initiator' | 'Target';
  recordings?: Recording[];
}

export interface SessionData {
  id: string;
  extensionId: string;
  accountId: string;
  parties: Party[];
  creationTime?: string;
  voiceCallToken?: string;
}

export interface ForwardParams {
  phoneNumber?: string;
  extensionNumber?: string;
  voicemail?: string;
}

export interface TransferParams extends ForwardParams {
  parkOrbit?: string;
}

export interface FlipParams {
  callFlipId: string;
}

export interface PartyParams {
  muted?: boolean;
  standAlone?: boolean;
}

export interface RecordParams {
  id: string;
  active: boolean;
}

export interface SuperviseParams {
  mode: 'Listen';
  deviceId: string;
  extensionNumber: string;
}
