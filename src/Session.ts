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
}
