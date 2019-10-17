import { EventEmitter } from "events";
import RingCentral from 'ringcentral';

import { formatParty } from './formatParty';

function objectEqual(obj1: any, obj2: any) {
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

function diffParty(oldParty: Party, updatedParty: Party) {
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

function diffParties(oldParties: Party[], updatedParties: Party[]) {
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

export class Session extends EventEmitter {
  private _data: any;
  private _eventSequence: Number;
  private _sdk: any;
  private _accountLevel: boolean;

  constructor(rawData: SessionData, sdk: RingCentral, accountLevel: boolean) {
    super();
    const { sequence, ...data } = rawData;
    this._data = data;
    this._eventSequence = sequence;
    this._sdk = sdk;
    this._accountLevel = !!accountLevel;

    return new Proxy(this, {
      get(target, name, receiver) {
        if (!Reflect.has(target, name)) {
          return target._data[name];
        }
        return Reflect.get(target, name, receiver);
      },
    });
  }

  public onUpdated(data: SessionData) {
    const partiesDiff =  diffParties(this.parties, data.parties);
    partiesDiff.forEach((diff) => {
      if (diff.type === 'new') {
        this._data.parties = [].concat(this.parties).concat(diff.party);
        this.emit('status', { party: diff.party });
        return;
      }
      if (this._eventSequence && data.sequence < this._eventSequence) {
        return;
      }
      if (diff.type === 'update') {
        const oldPartyIndex = this.parties.findIndex(p => p.id === diff.party.id);
        const parties = this.parties.slice(0);
        parties[oldPartyIndex] = {
          ...parties[oldPartyIndex],
          ...diff.party,
        }
        this._data.parties = parties;
        diff.partyDiffs.forEach((partyDiff) => {
          this.emit(partyDiff.key, { party: diff.party });
        });
        return;
      }
    });
    if (!this._eventSequence || data.sequence > this._eventSequence) {
      this._eventSequence = data.sequence;
    }
  }

  public restore(data: SessionData) {
    this._data = data;
  }

  get data() {
    return this._data || {};
  }

  get id() {
    return this.data.id;
  }

  get parties() {
    return this.data.parties || [];
  }

  get party() {
    const extensionId = this.data.extensionId;
    const accountId = this.data.accountId;
    return this.parties.find(p => {
      if (this._accountLevel) {
        return p.accountId === accountId;
      }
      return p.extensionId === extensionId;
    });
  }

  get otherParties() {
    if (!this.party) {
      return this.parties;
    }
    const partyId = this.party.id;
    return this.parties.filter(p => p.id !== partyId);
  }

  get recordings() {
    const party = this.party;
    return (party && party.recordings) || [];
  }

  get voiceCallToken() {
    return this.data.voiceCallToken;
  }

  toJSON() {
    return this.data;
  }

  async reload() {
    const response = await this._sdk.platform().get(`/account/~/telephony/sessions/${this._data.id}`);
    const data = response.json();
    data.extensionId = this.data.extensionId;
    data.accountId = this.data.accountId;
    data.parties = data.parties.map(p => formatParty(p));
    this._data = data;
  }

  async drop() {
    await this._sdk.platform().delete(
      `/account/~/telephony/sessions/${this._data.id}`
    );
  }

  private saveNewPartyData(rawParty) {
    const newParty = formatParty(rawParty);
    const newParties = this._data.parties.filter((p) => p.id !== newParty.id);
    newParties.push(newParty);
    this._data.parties = newParties;
  }

  async hold() {
    const oldParty = this.party;
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${oldParty.id}/hold`
    );
    const newParty = response.json();
    this.saveNewPartyData(newParty);
    this.emit('status', { party: this.party });
    return this.party;
  }

  async unhold() {
    const oldParty = this.party;
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${oldParty.id}/unhold`
    );
    const newParty = response.json();
    this.saveNewPartyData(newParty);
    this.emit('status', { party: this.party });
    return this.party;
  }

  async toVoicemail() {
    await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/reject`
    );
  }

  async ignore(params: IgnoreParams) {
    await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/ignore`,
      params
    );
  }

  async answer(params: AnswerParams) {
    await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/answer`,
      params
    );
  }

  async reply(params: ReplyWithTextParams) {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/reply`,
      params,
    );
    const rawParty = response.json();
    this.saveNewPartyData(rawParty);
    this.emit('status', { party: this.party });
    return this.party;
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

  async park() {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/park`,
    );
    return response.json();
  }

  // async pickup(params: PickUpParams) {
  //   const response = await this._sdk.platform().post(
  //     `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/pickup`,
  //     params,
  //   );
  //   return response.json();
  // }

  // async transferToVoicemail() {
  //   const result = await this.forward({ voicemail: this._data.extensionId });
  //   return result;
  // }

  async flip(params: FlipParams) {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/flip`,
      params
    );
    return response.json();
  }

  async updateParty(params: PartyParams) {
    const response = await this._sdk.platform().send({
      method: 'PATCH',
      url: `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}`,
      query: null,
      body: params
    });
    const rawParty = response.json();
    this.saveNewPartyData(rawParty);
    return rawParty;
  }

  async mute() {
    const result = await this.updateParty({ muted: true });
    this.emit('muted', { party: result })
    return result;
  }

  async unmute() {
    const result = await this.updateParty({ muted: false });
    this.emit('muted', { party: result })
    return result;
  }

  async createRecord() {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/recordings`,
    );
    const recording = response.json();
    const recordings = (this.party.recordings || []).filter(r => r.id !== recording.id);
    recordings.push(recording);
    this.party.recordings = recordings
    return recording;
  }

  async updateRecord(params: RecordParams) {
    const response = await this._sdk.platform().send({
      method: 'PATCH',
      url: `/account/~/telephony/sessions/${this._data.id}/parties/${this.party.id}/recordings/${params.id}`,
      query: null,
      body: {
        active: params.active,
      }
    });
    const recording = response.json();
    const recordings = (this.party.recordings || []).filter(r => r.id !== recording.id);
    recordings.push(recording);
    this.party.recordings = recordings
    return recording;
  }

  async pauseRecord(recordingId: string) {
    const result = await this.updateRecord({ id: recordingId, active: false });
    return result;
  }

  async resumeRecord(recordingId: string) {
    const result = await this.updateRecord({ id: recordingId, active: true });
    return result;
  }

  async supervise(params: SuperviseParams) {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/supervise`,
      params
    );
    return response.json();
  }

  async bringInParty(params: BringInParams) {
    const response = await this._sdk.platform().post(
      `/account/~/telephony/sessions/${this._data.id}/parties/bring-in`,
      params,
    );
    return response.json();
  }

  async removeParty(partyId: string) {
    const response = await this._sdk.platform().delete(
      `/account/~/telephony/sessions/${this._data.id}/parties/${partyId}`
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
  sequence?: number;
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

export interface BringInParams {
  partyId: string;
  sessionId: string;
}

export interface AnswerParams {
  deviceId: string;
}

export interface IgnoreParams {
  deviceId: string;
}

export enum ReplyWithPattern {
  willCallYouBack = 'WillCallYouBack',
  callMeBack = 'CallMeBack',
  onMyWay = 'OnMyWay',
  onTheOtherLine = 'OnTheOtherLine',
  willCallYouBackLater = 'WillCallYouBackLater',
  callMeBackLater = 'CallMeBackLater',
  inAMeeting = 'InAMeeting',
  onTheOtherLineNoCall = 'OnTheOtherLineNoCall'
}

export interface ReplyWithPatternParams {
  pattern: ReplyWithPattern,
  time?: number,
  timeUnit?: 'Minute' | 'Hour' | 'Day',
}

export interface ReplyWithTextParams {
  replyWithText?: string;
  replyWithPattern?: ReplyWithPatternParams,
}

export interface PickUpParams {
  deviceId: string;
}
