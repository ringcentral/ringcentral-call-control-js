import * as fetchMock from 'fetch-mock';
import * as RingCentral from 'ringcentral';

import * as extensionBody from './data/extensionInfo.json';
import * as deviceBody from './data/device.json';
import * as presenceBody from './data/presence.json';
import * as accountPresenceBody from './data/accountPresence.json';
import * as telephonySessionBody from './data/telephonySessionOutbound.json';
import * as telephonySessionCallOutBody from './data/telephonySessionCallOut.json';
import * as telephonyConferenceBody from './data/telephonyConference.json';
import * as telephonySessionPartyBody from './data/telephonySessionOutboundParty.json';
import * as telephonySessionPartyForwardBody from './data/telephonySessionInboundPartyForward.json';
import * as telephonySessionPartyTransferBody from './data/telephonySessionOutboundPartyTransfer.json';
import * as telephonyConferenceBringInBody from './data/telephonyConferenceBringIn.json'
import * as telephonySessionInboundPartyBody from './data/telephonySessionInboundParty.json';

export const mockServer = 'http://whatever';
export function createSDK(options = {}) {
  const opts = {
    ...options,
    appKey: 'test key',
    appSecret: 'test secret',
    server: mockServer,
    Request: fetchMock.config.Request,
    Response: fetchMock.config.Response,
    Headers: fetchMock.config.Headers,
    fetch: fetchMock.fetchHandler,
    refreshDelayMs: 1,
    redirectUri: 'http://foo',
    cachePrefix: 'sdkPrefix',
  };
  return new RingCentral(opts);
}

export function restore() {
  fetchMock.restore();
}

export function reset() {
  fetchMock.reset();
}

export function mockApi({
  method = 'GET',
  path,
  server = mockServer,
  url,
  body = {},
  status = 200,
  statusText = 'OK',
  headers,
  isOnce = true,
} : {
  method?: string,
  path?: string,
  server?: string,
  url?: string,
  body?: any,
  status?: Number,
  statusText?: string,
  headers?: any,
  isOnce?: boolean,
}) {
  let responseHeaders;
  const isJson = typeof body !== 'string';
  if (isJson && !headers) {
    responseHeaders = {
      'Content-Type': 'application/json'
    };
  } else {
    responseHeaders = headers;
  }
  let mockUrl;
  if (url) {
    mockUrl = url;
  } else {
    mockUrl = `${server}${path}`;
  }
  const mock = isOnce ? fetchMock.once.bind(fetchMock) : fetchMock.mock.bind(fetchMock);
  mock({
    method,
    matcher: mockUrl, 
    overwriteRoutes: false,
    response: new fetchMock.config.Response(isJson ? JSON.stringify(body) : body, {
      status,
      statusText,
      headers: responseHeaders,
    }),
    repeat: isOnce ? 1 : 20,
  });
}

export function mockAuthentication() {
  mockApi({
    method: 'POST',
    path: '/restapi/oauth/token',
    body: {
      access_token: 'ACCESS_TOKEN',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'REFRESH_TOKEN',
      refresh_token_expires_in: 60480,
      scope: 'SMS RCM Foo Boo',
      expireTime: new Date().getTime() + 3600000,
      owner_id: '23231231',
      endpoint_id: '3213213131',
    },
    isOnce: true
  });
}

export function logout() {
  mockApi({
    method: 'POST',
    path: '/restapi/oauth/revoke',
    isOnce: true,
  });
}

export function tokenRefresh(failure) {
  if (!failure) {
    mockApi({
      method: 'POST',
      path: '/restapi/oauth/token',
      body: {
        access_token: 'ACCESS_TOKEN_FROM_REFRESH',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'REFRESH_TOKEN_FROM_REFRESH',
        refresh_token_expires_in: 60480,
        scope: 'SMS RCM Foo Boo'
      }
    });
  } else {
    mockApi({
      method: 'POST',
      path: '/restapi/oauth/token',
      body: {
        message: 'Wrong token',
        error_description: 'Wrong token',
        description: 'Wrong token'
      },
      status: 400,
    });
  }
}

export function mockDevice(mockResponse = {}) {
  mockApi({
    url: `begin:${mockServer}/restapi/v1.0/account/~/extension/~/device`,
    body: {
      ...deviceBody,
      ...mockResponse,
    },
    isOnce: true
  });
}

export function mockExtensionInfo(mockResponse = {}) {
  mockApi({
    path: '/restapi/v1.0/account/~/extension/~',
    body: {
      ...extensionBody,
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockPresence(mockResponse = {}) {
  mockApi({
    path: `/restapi/v1.0/account/~/extension/~/presence?detailedTelephonyState=true&sipData=true`,
    method: 'GET',
    body: {
      ...presenceBody,
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockAccountPresence(mockResponse = {}) {
  mockApi({
    path: `/restapi/v1.0/account/~/presence?detailedTelephonyState=true&sipData=true`,
    method: 'GET',
    body: {
      ...accountPresenceBody,
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneSession(mockResponse = {}) {
  mockApi({
    url: `begin:${mockServer}/restapi/v1.0/account/~/telephony/sessions/s-`,
    method: 'GET',
    body: {
      ...telephonySessionBody,
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionCallOut(mockResponse = {}) {
  mockApi({
    path: '/restapi/v1.0/account/~/telephony/call-out',
    method: 'POST',
    body: {
      ...telephonySessionCallOutBody,
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneConference(mockResponse = {}) {
  mockApi({
    path: '/restapi/v1.0/account/~/telephony/conference',
    method: 'POST',
    body: {
      ...telephonyConferenceBody,
      ...mockResponse,
    },
    isOnce: true,
  });
}


export function mockTelephoneSessionUpdateParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId',
    method: 'PATCH',
    body: {
      ...telephonySessionPartyBody,
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionHoldParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/hold',
    method: 'POST',
    body: {
      ...telephonySessionPartyBody,
      status: {
        code: 'Hold'
      },
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionUnholdParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/unhold',
    method: 'POST',
    body: {
      ...telephonySessionPartyBody,
      status: {
        code: 'Answered'
      },
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionDrop(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId',
    method: 'DELETE',
    body: {},
    isOnce: true,
  });
}

export function mockTelephoneSessionCreateRecording(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/recordings',
    method: 'POST',
    body: {
      active: false,
      id: '6962564004',
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionUpdateRecording(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/recordings/:recordId',
    method: 'PATCH',
    body: {
      active: false,
      id: '6962564004',
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionRejectParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/reject',
    method: 'POST',
    body: {},
    isOnce: true,
  });
}

export function mockTelephoneSessionForwardParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/forward',
    method: 'POST',
    body: {
      ...telephonySessionPartyForwardBody
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionTransferParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/transfer',
    method: 'POST',
    body: {
      ...telephonySessionPartyTransferBody
    },
    isOnce: true,
  });
}


export function mockTelephoneSessionRemoveParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId',
    method: 'DELETE',
    body: {},
    isOnce: true,
  });
}

export function mockTelephoneSessionBringInParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/bring-in',
    method: 'POST',
    body: {
      ...telephonyConferenceBringInBody,
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionIgnoreParty() {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/ignore',
    method: 'POST',
    body: {},
    isOnce: true,
  });
}

export function mockTelephoneSessionReplyParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/reply',
    method: 'POST',
    body: {
      ...telephonySessionInboundPartyBody,
      status: {
        code: 'Setup',
        reason: 'CallReplied',
      },
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionAnswerParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/answer',
    method: 'POST',
    body: {
      ...telephonySessionInboundPartyBody,
      status: {
        code: 'Proceeding',
      },
      ...mockResponse,
    },
    isOnce: true,
  });
}

export function mockTelephoneSessionParkParty(mockResponse = {}) {
  mockApi({
    url: 'express:/restapi/v1.0/account/~/telephony/sessions/:sessionId/parties/:partyId/park',
    method: 'POST',
    body: {
      ...telephonySessionInboundPartyBody,
      park: {
        id: '*801',
      },
      status: {
        code: 'Parked',
      },
      ...mockResponse,
    },
    isOnce: true,
  });
}
