$(function() {
  var rcsdk = null;
  var platform = null;
  var subscriptions = null;
  var loggedIn = false;
  var subscription = null;
  var rcCallControl = null;
  var redirectUri = getRedirectUri();
  const defaultClientId = '';

  var $app = $('#app');
  var $authFlowTemplate = $('#template-auth-flow');
  var $callTemplate = $('#template-call');
  var $callControlTemplate = $('#template-call-control');
  var $incomingCallTemplate = $('#template-incoming');
  var $callPage = null;
  var $loadingModal = $('.loading-modal');

  function getRedirectUri() {
    if (window.location.pathname.indexOf('/index.html') > 0) {
      return window.location.protocol + '//' + window.location.host + window.location.pathname.replace('/index.html', '') + '/redirect.html';
    }
    return window.location.protocol + '//' + window.location.host + window.location.pathname + 'redirect.html';
  }

  function cloneTemplate($tpl) {
    return $($tpl.html());
  }

  function initCallControl() {
    subscription = subscriptions.createSubscription();
    var cachedSubscriptionData = rcsdk.cache().getItem('rc-call-control-subscription-key');
    if (cachedSubscriptionData) {
      try {
        subscription.setSubscription(cachedSubscriptionData); // use the cache
      } catch (e) {
        console.warn('Cannot set subscription from cache data', e);
        subscription.setEventFilters([
          '/restapi/v1.0/account/~/extension/~/telephony/sessions',
        ]);
      }
    } else {
      subscription.setEventFilters([
        '/restapi/v1.0/account/~/extension/~/telephony/sessions',
      ]);
    }
    subscription.on([subscription.events.subscribeSuccess, subscription.events.renewSuccess], function() {
      rcsdk.cache().setItem(cacheKey, subscription.subscription());
    });
    rcCallControl = new RingCentralCallControl({ sdk: rcsdk });
    window.rcCallControl = rcCallControl;
    subscription.on(subscription.events.notification, function(msg) {
      // console.log(JSON.stringify(msg, null, 2));
      window.rcCallControl.onNotificationEvent(msg)
    });
    subscription.register();
  }

  function showCallPage() {
    $loadingModal.modal('show');
    $callPage = cloneTemplate($callTemplate);
    var $deviceSelect = $callPage.find('select[name=device]').eq(0);
    var $phoneNumber = $callPage.find('input[name=number]').eq(0);
    var $deviceRefresh = $callPage.find('.device-refresh').eq(0);
    var $deviceAlert = $callPage.find('.device-alert').eq(0);
    var $callForm = $callPage.find('.call-out-form').eq(0);
    var $logout = $callPage.find('.logout').eq(0);
    function refreshDevices() {
      $deviceSelect.empty();
      var devices = rcCallControl.devices.filter(function(d) { return d.status === 'Online' });
      if (devices.length > 0) {
        $deviceAlert.hide();
      }

      devices.forEach(function (device) {
        $deviceSelect.append('<option value="' + device.id + '">' + device.name + '</option>')
      });
    }
    function onInitializedEvent() {
      refreshDevices();
      refreshCallList();
      rcCallControl.sessions.forEach(function(session) {
        session.on('status', function() {
          refreshCallList();
        });
      });
      $loadingModal.modal('hide');
    }
    if (rcCallControl.ready) {
      onInitializedEvent();
    } else {
      rcCallControl.on('initialized', onInitializedEvent);
    }
    rcCallControl.on('new', function(session) {
      // console.log('new');
      // console.log(JSON.stringify(session.data, null, 2));
      refreshCallList();
      session.on('status', function(event) {
        // console.log(event);
        refreshCallList();
      });
      var party = session.party;
      var status = party.status.code;
      if (party.direction === 'Inbound' && (status === 'Proceeding' || status === 'Setup')) {
        showIncomingCallModal(session);
      }
    });
    $callForm.on('submit', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var deviceId = $deviceSelect.val();
      var phoneNumber = $phoneNumber.val();
      var params = {};
      if (phoneNumber.length > 5) {
        params.phoneNumber = phoneNumber;
      } else {
        params.extensionNumber = phoneNumber;
      }
      rcCallControl.createCall(deviceId, params).then(function(session) {
        showCallControlModal(session);
        refreshCallList();
        session.on('status', function() {
          refreshCallList();
        });
      });
    });
    $deviceRefresh.on('click', function(e) {
      e.preventDefault();
      rcCallControl.refreshDevices().then(function () {
        refreshDevices();
      });
    });
    $logout.on('click', function(e) {
      e.preventDefault();
      platform.logout().then(function () {
        window.location.reload();
      });
    });
    $app.empty().append($callPage);
    document.addEventListener('click', (event) => {
      var target = event.target;
      if (target.nodeName !== 'TD') {
        return;
      }
      var sessionId = target.parentElement.getAttribute('data-id');
      if (!sessionId) {
        return;
      }
      var session = rcCallControl.sessions.find(s => s.id === sessionId);
      if (!session) {
        return;
      }
      var party = session.party;
      var status = party.status.code;
      if (status === 'VoiceMail' || status === 'Disconnected') {
        return;
      }
      if ((status === 'Proceeding' || status === 'Setup') && party.direction === 'Inbound') {
        showIncomingCallModal(session);
        return;
      }
      showCallControlModal(session);
    });
  }

  function refreshCallList() {
    var $callList = $callPage.find('.call-list').eq(0);
    $callList.empty();
    rcCallControl.sessions.forEach(function (session) {
      if (!session.party) {
        return;
      }
      $callList.append(
        '<tr data-id="' + session.id + '">' +
          '<td>' + session.party.direction + '</td>' +
          '<td>' + (session.party.from.phoneNumber || session.party.from.extensionNumber) + '</td>' +
          '<td>' + (session.party.to.phoneNumber || session.party.to.extensionNumber) + '</td>' +
          '<td>' + session.party.status.code + '</td>' +
          '<td>' + session.otherParties.map(p => p.status.code).join(',') + '</td>' +
        '</tr>'
      )
    });
  }

  function showCallControlModal(session) {
    var $modal = cloneTemplate($callControlTemplate).modal();
    var $transferForm = $modal.find('.transfer-form').eq(0);
    var $transfer = $modal.find('input[name=transfer]').eq(0);
    var $from = $modal.find('input[name=from]').eq(0);
    var $to = $modal.find('input[name=to]').eq(0);
    var $myStatus = $modal.find('input[name=myStatus]').eq(0);
    var $otherStatus = $modal.find('input[name=otherStatus]').eq(0);

    var party = session.party;
    $myStatus.val(party.status.code);
    $otherStatus.val(session.otherParties.map(p => p.status.code).join(','));
    $from.val(party.from.phoneNumber || party.from.extensionNumber);
    $to.val(party.to.phoneNumber || party.to.extensionNumber);
    $modal.find('.hangup').on('click', function() {
      session.drop();
    });
    $modal.find('.mute').on('click', function() {
      session.mute().then(function() {
        console.log('muted');
      }).catch(function(e) {
          console.error('mute failed', e.stack || e);
      });
    });

    $modal.find('.unmute').on('click', function() {
      session.unmute().then(function() {
        console.log('unmuted');
      }).catch(function(e) {
          console.error('unmute failed', e.stack || e);
      });
    });
    $modal.find('.hold').on('click', function() {
      session.hold().then(function() {
        console.log('Holding');
      }).catch(function(e) {
          console.error('Holding failed', e.stack || e);
      });
    });
    $modal.find('.unhold').on('click', function() {
      session.unhold().then(function() {
        console.log('UnHolding');
      }).catch(function(e) {
          console.error('UnHolding failed', e.stack || e);
      });
    });
    $modal.find('.startRecord').on('click', function() {
      if (session.recordings.length === 0) {
        session.createRecord().catch(function(e) {
            console.error('create record failed', e.stack || e);
        });
        return;
      }
      var recording = session.recordings[0];
      session.resumeRecord(recording.id).then(function(result) {
        console.log('recording resumed');
      }).catch(function(e) {
        console.error('resume record failed', e.stack || e);
      });
    });
    $modal.find('.stopRecord').on('click', function() {
      if (session.recordings.length === 0) {
        return;
      }
      var recording = session.recordings[0];
      session.pauseRecord(recording.id).then(function() {
        console.log('recording stopped');
      }).catch(function(e) {
        console.error('stop recording failed', e.stack || e);
      });
    });
    $modal.find('.park').on('click', function() {
      session.park().then(function(data) {
        console.log('Parked');
        $('#alert-message').html('Your call is parked at location: ' + data.park.id);
        $('#alert-item').show();
        $modal.modal('hide');
      }).catch(function(e) {
          console.error('Park failed', e.stack || e);
      });
    });
    $transferForm.on('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var phoneNumber = $transfer.val();
      var params = {};
      if (phoneNumber.length > 5) {
        params.phoneNumber = phoneNumber;
      } else {
        params.extensionNumber = phoneNumber;
      }
      session.transfer(params).then(function () {
        console.log('transfered');
      }).catch(function(e) {
        console.error('transfer failed', e.stack || e);
      });
    });
    session.on('status', function() {
      if (session.party.status.code === 'Disconnected') {
        $modal.modal('hide');
        return;
      }
      $myStatus.val(session.party.status.code);
      $otherStatus.val(session.otherParties.map(p => p.status.code).join(','));
    });
  }

  function showIncomingCallModal(session) {
    var $modal = cloneTemplate($incomingCallTemplate).modal();
    var $from = $modal.find('input[name=from]').eq(0);
    var $to = $modal.find('input[name=to]').eq(0);
    var $forwardForm = $modal.find('.forward-form').eq(0);
    var $forward = $modal.find('input[name=forward]').eq(0);
    var party = session.party;
    $from.val(party.from.phoneNumber || party.from.extensionNumber);
    $to.val(party.to.phoneNumber || party.to.extensionNumber);

    $modal.find('.toVoicemail').on('click', function() {
      session.toVoicemail();
    });
    $forwardForm.on('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var phoneNumber = $forward.val();
      var params = {};
      if (phoneNumber.length > 5) {
        params.phoneNumber = phoneNumber;
      } else {
        params.extensionNumber = phoneNumber;
      }
      session.forward(params).then(function () {
        console.log('forwarded');
      }).catch(function(e) {
        console.error('forward failed', e.stack || e);
      });
    });
    var hasAnswered = false;
    session.on('status', function() {
      if (
        session.party.status.code === 'Disconnected' ||
        session.party.status.code === 'VoiceMail'
      ) {
        $modal.modal('hide');
        return;
      }
      if (!hasAnswered && session.party.status.code === 'Answered') {
        hasAnswered = true;
        $modal.modal('hide');
        showCallControlModal(session);
      }
    })
  }

  function onLoginSuccess(server, clientId) {
    localStorage.setItem('rcCallControlServer', server || '');
    localStorage.setItem('rcCallControlClientId', clientId || '');
    initCallControl();
    showCallPage();
  }

  function show3LeggedLogin(server, clientId) {
    rcsdk = new RingCentral.SDK({
      cachePrefix: 'rc-call-control-demo',
      clientId: clientId,
      server: server,
      redirectUri: redirectUri
    });
    subscriptions = new RingCentral.Subscriptions({
      sdk: rcsdk
   });

    platform = rcsdk.platform();

    var loginUrl = platform.loginUrl({ usePKCE: true });
    platform.loggedIn().then(function(isLogin) {
      loggedIn = isLogin;
      if (loggedIn) {
        onLoginSuccess(server, clientId);
        return;
      }
      platform.loginWindow({ url: loginUrl })
        .then(function (loginOptions){
          return platform.login(loginOptions);
        })
        .then(function() {
          onLoginSuccess(server, clientId);
        })
        .catch(function(e) {
          console.error(e.stack || e);
        });
    });
  };

  function init() {
    var $authForm = cloneTemplate($authFlowTemplate);
    var $server = $authForm.find('input[name=server]').eq(0);
    var $clientId = $authForm.find('input[name=clientId]').eq(0);
    var $redirectUri = $authForm.find('input[name=redirectUri]').eq(0);
    $server.val(localStorage.getItem('rcCallControlServer') || RingCentral.SDK.server.sandbox);
    $clientId.val(localStorage.getItem('rcCallControlClientId') || defaultClientId);
    $redirectUri.val(redirectUri);
    $('#alert-item').hide();
    $('#alert-close').on('click', function() {
      $('#alert-item').hide();
    });
    $authForm.on('submit', function(e) {
      e.preventDefault();
      e.stopPropagation();
      show3LeggedLogin($server.val(), $clientId.val());
    });

    $app.empty().append($authForm);
  }

  init();
});
