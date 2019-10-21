# RingCentral Call Control JS SDK

[![Coverage Status](https://coveralls.io/repos/github/embbnux/ringcentral-call-control-js/badge.svg?branch=master)](https://coveralls.io/github/embbnux/ringcentral-call-control-js?branch=master)
[![NPM Version](https://img.shields.io/npm/v/ringcentral-call-control.svg?style=flat-square)](https://www.npmjs.com/package/ringcentral-call-control)

RingCentral Call Control JS SDK is wrapper of RingCentral JS SDK to help developer call [RingCentral Call Control API](https://developers.ringcentral.com/api-reference/Call-Control/) more functionally.

## Prerequisites

* You will need an active RingCentral account to create RingCentral app. Don't have an account? [Get your Free RingCentral Developer Account Now!](https://developers.ringcentral.com/)
* A RingCentral app
    * App type: Browser-Based or Server/Web
    * Permissions: 'Active Call Control', 'Read Accounts', 'Read Presence', 'Webhook Subscriptions'

## Table of Contents

* [Install](#install)
* [Usage](#usage)
* [Demo](#demo)
* [API](#api)
  * [Init](#init)
  * [Events](#events)
  * [Sessions List](#sessions-list)
  * [Session API](#session-api)
  * [Session Events](#session-events)
  * [Devices](#devices)

## Install

Use npm or yarn

```bash
$ yarn add ringcentral ringcentral-call-control
```

CDN

```html
<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/es6-promise/3.2.2/es6-promise.js"></script>
<script type="text/javascript" src="https://cdn.pubnub.com/sdk/javascript/pubnub.4.20.1.js"></script>
<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/fetch/0.11.1/fetch.js"></script>
<script type="text/javascript" src="https://cdn.rawgit.com/ringcentral/ringcentral-js/3.2.2/build/ringcentral.js"></script>
<script type="text/javascript" src="https://unpkg.com/ringcentral-call-control@0.0.4/build/index.js"></script>
```

## Usage

For this example you will also need to have [RingCentral JS SDK](https://github.com/ringcentral/ringcentral-js#installation) installed.

Configure the web-phone

```js
// npm import
// import { RingCentralCallControl } from 'ringcentral-call-control';
// or use CDN
// window.RingCentralCallControl

var appClientId = '...'; 
var appClientSecret = '...';
var appName = '...';
var appVersion = '...';

var sdk = new RingCentral.SDK({
  appKey: appClientId,
  appSecret: appClientSecret,
  appName: appName,
  appVersion: appVersion,
  server: RingCentral.SDK.server.production // or .sandbox
});

var platform = sdk.platform();

platform
  .login({
    username: '...',
    password: '...'
  })
  .then(function() {
    var rcCallControl = new RingCentralCallControl({ sdk: sdk });
    var subscription = sdk.createSubscription();

    subscription.setEventFilters(['/restapi/v1.0/account/~/extension/~/telephony/sessions']);
    subscription.on(subscription.events.notification, function(msg) {
       rcCallControl.onNotificationEvent(msg)
    });
    subscription.register();
    return rcCallControl;
  })
```

## Demo

```bash
$ git clone https://github.com/embbnux/ringcentral-call-control-js.git
$ cd ringcentral-call-control-js
$ yarn
$ yarn build
$ yarn start
```

Open `http://localhost:8080/demo/`, and login with RingCentral Sandbox account to test.

## API

### Init

Firstly, we need to create Call Control instance after user login with [RingCentral JS SDK](https://github.com/ringcentral/ringcentral-js/tree/v3#login). Then connect `onNotificationEvent` with subscription notification event.

```js
var rcCallControl = new RingCentralCallControl({ sdk: sdk });
var initialized = false;
var subscription = sdk.createSubscription();
subscription.setEventFilters(['/restapi/v1.0/account/~/extension/~/telephony/sessions']);
subscription.on(subscription.events.notification, function(msg) {
  rcCallControl.onNotificationEvent(msg)
});
subscription.register();
rcCallControl.on('initialized', function() {
  initialized = true;
});
```

### Events

#### New session event

```js
var session = null;

rcCallControl.on('new', (newSession) => {
  session = newSession;
});
```

#### Initialized

```js
rcCallControl.on('initialized', function() {
  initialized = true;
});
```

### Sessions List

```js
var sessions = rcCallControl.sessions;
```

## Session API

#### Create a Call Session

```js
var session = null;
var deviceId = rcCallControl.devices.filter(d => d.status === 'Online')[0].id;
rcCallControl.createCall(deviceId, { phoneNumber: 'phoneNumberToCall' }).then((newSession) => {
  session = newSession;
  // ...
})
```

#### Drop Session

Drops a call session.

```js
session.drop().then(...);
```

#### Hold Unhold

Puts the party to stand-alone mode and starts to play Hold Music according to configuration & state to peers. There is a known limitation for Hold API - hold via REST API doesn't work with hold placed via RingCentral apps or HardPhone. It means that if you muted participant via Call Control API and RingCentral Desktop app, then you need to unhold both endpoints to remove Hold Music and bring media back.

```js
session.hold().then(...);
session.unhold().then(...);
```

#### Mute Unmute

Callee will be put on mute or unmute

```js
session.mute().then(...);
session.unmute().then(...);
```

#### To Voicemail

```js
session.toVoicemail().then(...);
```

#### Ignore in call queue

```js
session.ignore({ deviceId: 'your_device_id' }).then(...);
```

#### Answer

```js
session.answer({ deviceId: 'your_device_id' }).then(...);
```

#### Reply with message

```js
session.reply({ replyWithText: 'On my way' }).then(...);
session.reply({
  replyWithPattern: {
    pattern: 'WillCallYouBack',
    time: 10,
    timeUnit: 'Minute'
  }
}).then(...);
```

#### Forward

Distributes a non-answered call to the defined target. Applicable for "Setup" or "Proceeding" states

```js
session.forward({ phoneNumber: 'phoneNumber' }).then(...);
```

#### Transfer

Transfers a party by placing a new call to the specified target

```js
session.transfer({ phoneNumber: 'phoneNumber' }).then(...);
```

#### Flip

Performs call flip procedure by holding opposite party and calling to the specified target.

```js
session.flip({ callFlipId: 'callFlipId' }).then(...);
```

#### Park

Performs call park procedure to set on park one of the call parties in call dialog.

```js
session.park().then(...);
```

#### Recording

Starts a new call recording for the party

```js
session.createRecord().then(...);
```

Pause/resume recording

```js
session.pauseRecord('recordingId').then(...);
session.resumeRecord('recordingId').then(...);
```

#### Supervise

Allows to monitor a call in 'Listen' mode. Input parameters should contain extension number of a monitored user and internal identifier of a supervisor's device. Call session should be specified in path. Currently is not supported for Sandbox environment.

```js
session.supervise({
  mode: 'Listen',
  deviceId: 'your deviceId',
  extensionNumber: 'extensionNumber'
}).then(...);
```

### Session Events

#### Status

```js
session.on('status', (event) => {
  // on status changed
  var party = event.party;
  var status = party.status;
  // ...
});
```

#### Muted

```js
session.on('muted', () => {
  // on muted changed
  var muted = session.muted;
  // ...
});
```

### Devices

Get current extension's all devices:

```js
var devices = rcCallControl.devices;
```

Refresh devices:

```js
rcCallControl.refreshDevices().then(() => {
  var devices = rcCallControl.devices;
});
```
