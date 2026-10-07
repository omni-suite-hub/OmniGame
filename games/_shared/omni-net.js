/*
 * games/_shared/omni-net.js
 * Universal WebRTC P2P Multiplayer Engine for OmniGame.
 *
 * Capabilities:
 * 1. 6-digit Room Key: Connect anywhere via WebRTC DataChannel.
 * 2. LAN Radar: Discover nearby players on the same network & invite to battle.
 * 3. Local BroadcastChannel: Zero-latency instant cross-tab / same-machine signaling.
 * 4. Resilient Multi-Broker MQTT 3.1.1 variable-length signaling with STUN.
 * 5. Built-in sleek modal UI (OmniNetUI).
 *
 * Zero external libraries: pure vanilla JS, standard WebRTC RTCDataChannel.
 */
(function (global) {
  'use strict';

  var RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.miwifi.com:3478' },
      { urls: 'stun:stun.qq.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  var BROKER_LIST = [
    'wss://broker-cn.emqx.io:8084/mqtt',
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];

  // Helper for MQTT remaining length encoding (supports any arbitrary payload size)
  function encodeMqttLength(len) {
    var bytes = [];
    do {
      var digit = len % 128;
      len = Math.floor(len / 128);
      if (len > 0) digit = digit | 0x80;
      bytes.push(digit);
    } while (len > 0);
    return bytes;
  }

  // Helper for MQTT remaining length decoding
  function decodeMqttLength(bytes, offset) {
    var multiplier = 1;
    var value = 0;
    var i = offset;
    var digit;
    do {
      if (i >= bytes.length) return null;
      digit = bytes[i++];
      value += (digit & 0x7f) * multiplier;
      multiplier *= 128;
      if (multiplier > 128 * 128 * 128) return null;
    } while ((digit & 0x80) !== 0);
    return { length: value, bytesRead: i - offset };
  }

  function OmniNet(options) {
    this.options = options || {};
    this.gameId = this.options.gameId || 'game';
    this.pc = null;
    this.dc = null;
    this.isHost = false;
    this.roomCode = null;
    this.state = 'idle'; // idle | connecting | connected | closed
    this.listeners = {};
    this.ws = null;
    this.brokerIdx = 0;
    this.myId = 'omg_' + Math.random().toString(36).slice(2, 8);
    this.profile = { nickname: '工位摸鱼高手', avatar: '🐱', elo: 1200 };
    this.opponentProfile = null;
    this._pendingCandidates = [];
    this.currentTopic = null;
    this._radarTimer = null;
    this._readyInterval = null;

    // Cross-tab local channel on same machine
    this.bc = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        var self = this;
        this.bc = new BroadcastChannel('omnigame_local_bus');
        this.bc.onmessage = function (e) {
          if (e.data && e.data.topic === self.currentTopic && e.data.senderId !== self.myId) {
            self._handleSignalMsg(e.data);
          }
        };
      } catch (err) {}
    }

    var selfInst = this;
    if (global.GameStore && global.GameStore.getProfile) {
      global.GameStore.getProfile().then(function (p) {
        if (p) selfInst.profile = p;
      });
    }
  }

  OmniNet.prototype.on = function (evt, fn) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(fn);
    return this;
  };

  OmniNet.prototype.emit = function (evt, data) {
    var list = this.listeners[evt] || [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](data); } catch (e) { console.error(e); }
    }
  };

  OmniNet.prototype.send = function (type, payload) {
    var sent = false;
    if (this.dc && this.dc.readyState === 'open') {
      var msg = JSON.stringify({ t: type, d: payload, ts: Date.now() });
      try {
        this.dc.send(msg);
        sent = true;
      } catch (e) {}
    }
    // High-reliability Dual Transport: If WebRTC DataChannel is not open, fallback to signaling relay!
    if (!sent && this.currentTopic) {
      this._signalSend({ type: 'relay_msg', t: type, d: payload, ts: Date.now() });
      sent = true;
    }
    return sent;
  };

  OmniNet.prototype.close = function () {
    this.state = 'closed';
    if (this._fallbackTimer) { clearTimeout(this._fallbackTimer); this._fallbackTimer = null; }
    if (this._radarTimer) { clearInterval(this._radarTimer); this._radarTimer = null; }
    if (this._readyInterval) { clearInterval(this._readyInterval); this._readyInterval = null; }
    if (this.dc) { try { this.dc.close(); } catch (e) {} this.dc = null; }
    if (this.pc) { try { this.pc.close(); } catch (e) {} this.pc = null; }
    if (this.ws) { try { this.ws.close(); } catch (e) {} this.ws = null; }
    if (this.bc) { try { this.bc.close(); } catch (e) {} this.bc = null; }
    this.emit('disconnected');
  };

  OmniNet.prototype._setupDataChannel = function (dc) {
    var self = this;
    this.dc = dc;
    dc.onopen = function () {
      if (self._fallbackTimer) { clearTimeout(self._fallbackTimer); self._fallbackTimer = null; }
      if (self._readyInterval) { clearInterval(self._readyInterval); self._readyInterval = null; }
      self.state = 'connected';
      self.emit('connected', { isHost: self.isHost, opponent: self.opponentProfile });
    };
    dc.onclose = function () {
      self.state = 'closed';
      self.emit('disconnected');
    };
    dc.onerror = function (err) {
      self.emit('error', err);
    };
    dc.onmessage = function (e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg && msg.t) {
          self.emit('message', msg);
          self.emit('msg:' + msg.t, msg.d);
        }
      } catch (err) {}
    };
  };

  OmniNet.prototype._createPC = function () {
    var self = this;
    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
    }
    var pc = new (window.RTCPeerConnection || window.webkitRTCPeerConnection)(RTC_CONFIG);
    this.pc = pc;

    pc.onicecandidate = function (e) {
      if (e.candidate) {
        self._signalSend({ type: 'candidate', candidate: e.candidate });
      }
    };

    pc.ondatachannel = function (e) {
      self._setupDataChannel(e.channel);
    };

    return pc;
  };

  /* ---------------- Robust Signaling via Multi-Broker WebSocket ---------------- */
  OmniNet.prototype._connectSignaling = function (topic, onOpen) {
    this.currentTopic = topic;
    var self = this;
    var brokerUrl = BROKER_LIST[this.brokerIdx % BROKER_LIST.length];

    try {
      if (this.ws) { try { this.ws.close(); } catch (e) {} }
      var ws = new WebSocket(brokerUrl, ['mqtt']);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';

      var openTimeout = setTimeout(function () {
        if (ws.readyState !== 1) {
          self._retryNextBroker(topic, onOpen);
        }
      }, 4000);

      ws.onopen = function () {
        clearTimeout(openTimeout);
        self._sendMqttConnect();
        setTimeout(function () {
          self._sendMqttSubscribe(topic);
          if (onOpen) onOpen();
        }, 220);
      };

      ws.onmessage = function (e) {
        var str = self._decodeMqttMessage(e.data);
        if (!str) return;
        try {
          var payload = JSON.parse(str);
          if (payload && payload.senderId !== self.myId) {
            self._handleSignalMsg(payload);
          }
        } catch (err) {}
      };

      ws.onerror = function () {
        clearTimeout(openTimeout);
        self._retryNextBroker(topic, onOpen);
      };

      ws.onclose = function () {
        clearTimeout(openTimeout);
      };
    } catch (e) {
      self._retryNextBroker(topic, onOpen);
    }
  };

  OmniNet.prototype._retryNextBroker = function (topic, onOpen) {
    this.brokerIdx++;
    if (this.brokerIdx < BROKER_LIST.length) {
      var self = this;
      setTimeout(function () {
        self._connectSignaling(topic, onOpen);
      }, 500);
    } else {
      this.emit('signalError', '网关连接失败，请检查网络');
    }
  };

  // Full-featured MQTT 3.1.1 packet encoder
  OmniNet.prototype._sendMqttConnect = function () {
    var rawId = [];
    for (var i = 0; i < this.myId.length; i++) rawId.push(this.myId.charCodeAt(i));
    var varHeader = [0, 4, 77, 81, 84, 84, 4, 2, 0, 60]; // MQTT 3.1.1, clean session, 60s
    var payload = [0, this.myId.length].concat(rawId);
    var body = varHeader.concat(payload);
    var lenBytes = encodeMqttLength(body.length);
    var packet = [0x10].concat(lenBytes).concat(body);
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(new Uint8Array(packet).buffer);
    }
  };

  OmniNet.prototype._sendMqttSubscribe = function (topic) {
    var tBytes = [];
    for (var i = 0; i < topic.length; i++) tBytes.push(topic.charCodeAt(i));
    var body = [0, 1, 0, topic.length].concat(tBytes).concat([0]); // packetId 1, QoS 0
    var lenBytes = encodeMqttLength(body.length);
    var packet = [0x82].concat(lenBytes).concat(body);
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(new Uint8Array(packet).buffer);
    }
  };

  OmniNet.prototype._signalSend = function (data) {
    data.senderId = this.myId;
    data.profile = this.profile;
    data.topic = this.currentTopic;
    if (this.peerId && !data.targetId) data.targetId = this.peerId;

    // 1. Send via local BroadcastChannel (cross-tab / same-machine instant delivery)
    if (this.bc) {
      try { this.bc.postMessage(data); } catch (e) {}
    }

    // 2. Send via WebSocket MQTT
    if (!this.ws || this.ws.readyState !== 1 || !this.currentTopic) return;
    var jsonStr = JSON.stringify(data);
    var tBytes = [];
    for (var i = 0; i < this.currentTopic.length; i++) tBytes.push(this.currentTopic.charCodeAt(i));
    var strBytes = [];
    for (var j = 0; j < jsonStr.length; j++) strBytes.push(jsonStr.charCodeAt(j));

    var body = [0, this.currentTopic.length].concat(tBytes).concat(strBytes);
    var lenBytes = encodeMqttLength(body.length);
    var packet = [0x30].concat(lenBytes).concat(body);

    try {
      this.ws.send(new Uint8Array(packet).buffer);
    } catch (e) {}
  };

  OmniNet.prototype._decodeMqttMessage = function (buffer) {
    if (!buffer || buffer.byteLength < 4) return null;
    var bytes = new Uint8Array(buffer);
    var header = bytes[0];
    if ((header & 0xf0) !== 0x30) return null; // not a PUBLISH packet

    var dec = decodeMqttLength(bytes, 1);
    if (!dec) return null;

    var topicOffset = 1 + dec.bytesRead;
    if (topicOffset + 2 >= bytes.length) return null;

    var topicLen = (bytes[topicOffset] << 8) | bytes[topicOffset + 1];
    var payloadOffset = topicOffset + 2 + topicLen;

    var out = '';
    for (var i = payloadOffset; i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  };

  OmniNet.prototype._handleSignalMsg = function (msg) {
    var self = this;
    if (msg.targetId && msg.targetId !== this.myId) return; // Ignore messages intended for other peers
    if (msg.profile) this.opponentProfile = msg.profile;

    // Handle guest ready in room
    if (msg.type === 'ready') {
      if (msg.senderId) this.peerId = msg.senderId;
      if (this.isHost) {
        this.emit('guestJoined', msg);
        if (!this._offering && this.state !== 'connected') {
          this._offering = true;
          this._startOffer();
        }
      }
    } else if (msg.type === 'offer') {
      if (msg.senderId) this.peerId = msg.senderId;
      if (this._readyInterval) {
        clearInterval(this._readyInterval);
        this._readyInterval = null;
      }
      this._createPC();
      this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(function () {
        self._flushPendingCandidates();
        return self.pc.createAnswer();
      }).then(function (answer) {
        return self.pc.setLocalDescription(answer);
      }).then(function () {
        self._signalSend({ type: 'answer', sdp: self.pc.localDescription });
        // Fallback timer: if DataChannel takes > 2.5s, connect via relay
        if (!self._fallbackTimer && self.state !== 'connected') {
          self._fallbackTimer = setTimeout(function () {
            if (self.state !== 'connected') {
              self.state = 'connected';
              self.emit('connected', { isHost: self.isHost, opponent: self.opponentProfile, relay: true });
            }
          }, 2500);
        }
      }).catch(function (err) {
        console.error('Error handling offer:', err);
      });
    } else if (msg.type === 'answer') {
      this._offering = false;
      if (msg.senderId) this.peerId = msg.senderId;
      if (this.pc) {
        this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(function () {
          self._flushPendingCandidates();
          // Fallback timer: if DataChannel takes > 2.5s, connect via relay
          if (!self._fallbackTimer && self.state !== 'connected') {
            self._fallbackTimer = setTimeout(function () {
              if (self.state !== 'connected') {
                self.state = 'connected';
                self.emit('connected', { isHost: self.isHost, opponent: self.opponentProfile, relay: true });
              }
            }, 2500);
          }
        }).catch(function (err) {
          console.error('Error handling answer:', err);
        });
      }
    } else if (msg.type === 'candidate') {
      if (msg.candidate) {
        if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
          try {
            this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(function () {});
          } catch (e) {}
        } else {
          this._pendingCandidates.push(msg.candidate);
        }
      }
    } else if (msg.type === 'presence') {
      this.emit('presence', msg);
    } else if (msg.type === 'challenge') {
      if (msg.targetId === this.myId) {
        this.peerId = msg.senderId;
        this.emit('challenge', msg);
      }
    } else if (msg.type === 'accept') {
      if (msg.targetId === this.myId) {
        this.peerId = msg.senderId;
        this.emit('challengeAccepted', msg);
        this._startOffer();
      }
    } else if (msg.type === 'relay_msg') {
      self.emit('message', { t: msg.t, d: msg.d });
      self.emit('msg:' + msg.t, msg.d);
    }
  };

  OmniNet.prototype._flushPendingCandidates = function () {
    var self = this;
    if (this.pc && this._pendingCandidates.length > 0) {
      var queue = this._pendingCandidates.slice();
      this._pendingCandidates = [];
      queue.forEach(function (cand) {
        self.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(function () {});
      });
    }
  };

  /* ---------------- Mode 1: 6-Digit Room Key ---------------- */
  OmniNet.prototype.createRoom = function (customCode) {
    var code = customCode || Math.floor(100000 + Math.random() * 900000).toString();
    this.roomCode = code;
    this.isHost = true;
    var topic = 'omnigame/room/' + this.gameId + '/' + code;
    var self = this;
    this._connectSignaling(topic, function () {
      self.emit('roomCreated', code);
    });
    return code;
  };

  OmniNet.prototype.joinRoom = function (code) {
    this.roomCode = code;
    this.isHost = false;
    var topic = 'omnigame/room/' + this.gameId + '/' + code;
    var self = this;
    this._connectSignaling(topic, function () {
      // Send ready repeatedly for a few seconds until offer arrives
      self._signalSend({ type: 'ready' });
      var tries = 0;
      self._readyInterval = setInterval(function () {
        tries++;
        if (self.state === 'connected' || tries > 8) {
          clearInterval(self._readyInterval);
          self._readyInterval = null;
        } else {
          self._signalSend({ type: 'ready' });
        }
      }, 700);
    });
  };

  OmniNet.prototype._startOffer = function () {
    var self = this;
    this._createPC();
    var dc = this.pc.createDataChannel('game', { ordered: true });
    this._setupDataChannel(dc);

    this.pc.createOffer().then(function (offer) {
      return self.pc.setLocalDescription(offer);
    }).then(function () {
      self._signalSend({ type: 'offer', sdp: self.pc.localDescription });
    }).catch(function (err) {
      console.error('Error starting offer:', err);
    });
  };

  /* ---------------- Mode 2: LAN Radar ---------------- */
  OmniNet.prototype.startLanRadar = function (lanChannel) {
    var ch = lanChannel || 'default';
    var topic = 'omnigame/lan/' + this.gameId + '/' + ch;
    var self = this;
    this._connectSignaling(topic, function () {
      self.broadcastPresence();
      if (self._radarTimer) clearInterval(self._radarTimer);
      self._radarTimer = setInterval(function () {
        self.broadcastPresence();
      }, 3000);
    });
  };

  OmniNet.prototype.broadcastPresence = function () {
    this._signalSend({ type: 'presence', profile: this.profile });
  };

  OmniNet.prototype.challengePlayer = function (opponentId) {
    this.isHost = true;
    this._signalSend({ type: 'challenge', targetId: opponentId });
  };

  OmniNet.prototype.acceptChallenge = function (challengerId) {
    this.isHost = false;
    this._signalSend({ type: 'accept', targetId: challengerId });
  };

  /* ---------------- UI Helper: Built-in Lobby Modal ---------------- */
  var OmniNetUI = {
    showLobby: function (opts) {
      var gameId = opts.gameId || 'game';
      var gameTitle = opts.gameTitle || '联机对战';
      var onReady = opts.onReady || function () {};

      var overlay = document.getElementById('omni-lobby-modal');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'omni-lobby-modal';
        overlay.innerHTML =
          '<div class="ol-box">' +
          '  <div class="ol-head">' +
          '    <h3>' + gameTitle + ' · 联机大厅</h3>' +
          '    <button class="ol-close" id="olCloseBtn">×</button>' +
          '  </div>' +
          '  <div class="ol-tabs">' +
          '    <button class="ol-tab active" data-tab="room">🔑 房间密钥</button>' +
          '    <button class="ol-tab" data-tab="lan">📡 局域网雷达</button>' +
          '    <button class="ol-tab" data-tab="local">👥 本地双人</button>' +
          '  </div>' +
          '  <div class="ol-body">' +
          '    <div class="ol-pane active" id="pane-room">' +
          '      <div class="ol-actions">' +
          '        <button class="ol-btn primary" id="olCreateRoomBtn">创建新房间</button>' +
          '      </div>' +
          '      <div class="ol-room-info" id="olRoomInfo" hidden>' +
          '        <p>你的房间密钥（发给好友或同事即可直连）：</p>' +
          '        <div class="ol-code-row">' +
          '          <b id="olRoomCode">—</b>' +
          '          <button class="ol-btn small" id="olCopyCodeBtn">复制密钥</button>' +
          '        </div>' +
          '        <div class="ol-status" id="olHostStatus">等待好友加入中…</div>' +
          '      </div>' +
          '      <div class="ol-divider"><span>或者输入密钥加入已有房间</span></div>' +
          '      <div class="ol-join-row">' +
          '        <input type="text" id="olJoinInput" placeholder="输入 6 位房间密钥" maxlength="6" />' +
          '        <button class="ol-btn" id="olJoinBtn">加入对决</button>' +
          '      </div>' +
          '      <div class="ol-status" id="olJoinStatus"></div>' +
          '    </div>' +
          '    <div class="ol-pane" id="pane-lan">' +
          '      <p class="ol-sub">自动扫描同一 Wi-Fi / 局域网内的在线玩家：</p>' +
          '      <div class="ol-player-list" id="olPlayerList">' +
          '        <div class="ol-empty">正在扫描局域网邻居…</div>' +
          '      </div>' +
          '    </div>' +
          '    <div class="ol-pane" id="pane-local">' +
          '      <p class="ol-sub">在同一台电脑/手机上轮流对决，免网络免延迟：</p>' +
          '      <button class="ol-btn primary full" id="olLocalPlayBtn">开始同屏对决</button>' +
          '    </div>' +
          '  </div>' +
          '</div>';

        var style = document.createElement('style');
        style.textContent =
          '#omni-lobby-modal{position:fixed;inset:0;background:rgba(10,12,24,0.85);backdrop-filter:blur(6px);' +
          'display:flex;align-items:center;justify-content:center;z-index:99999;font-family:system-ui,sans-serif;color:#eef1ff;}' +
          '#omni-lobby-modal[hidden],#omni-lobby-modal.hidden{display:none !important;}' +
          '.ol-box{width:90%;max-width:420px;background:#141831;border:1px solid #2e3358;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.6);}' +
          '.ol-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#1a1d35;border-bottom:1px solid #242844;}' +
          '.ol-head h3{margin:0;font-size:16px;font-weight:700;}' +
          '.ol-close{background:none;border:0;color:#a6abce;font-size:24px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:8px;transition:all .15s;}' +
          '.ol-close:hover{color:#fff;background:rgba(255,255,255,0.1);}' +
          '.ol-tabs{display:flex;background:#101328;border-bottom:1px solid #242844;}' +
          '.ol-tab{flex:1;padding:10px 6px;border:0;background:transparent;color:#a6abce;font-size:13px;cursor:pointer;transition:all .15s;}' +
          '.ol-tab.active{color:#fff;font-weight:700;background:#1a1d35;border-bottom:2px solid #3b82f6;}' +
          '.ol-body{padding:18px;}' +
          '.ol-pane{display:none;}' +
          '.ol-pane.active{display:block;}' +
          '.ol-btn{border:0;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;background:#242844;color:#eef1ff;cursor:pointer;transition:all .15s;}' +
          '.ol-btn:hover{filter:brightness(1.15);}' +
          '.ol-btn.primary{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;}' +
          '.ol-btn.small{padding:6px 12px;font-size:12px;}' +
          '.ol-btn.full{width:100%;margin-top:10px;}' +
          '.ol-code-row{display:flex;align-items:center;gap:12px;margin:8px 0;}' +
          '.ol-code-row b{font-size:32px;letter-spacing:4px;color:#38bdf8;font-family:monospace;}' +
          '.ol-join-row{display:flex;gap:8px;margin-top:10px;}' +
          '.ol-join-row input{flex:1;background:#0a0c18;border:1px solid #2e3358;color:#fff;padding:10px 14px;border-radius:10px;font-size:16px;letter-spacing:2px;outline:none;}' +
          '.ol-join-row input:focus{border-color:#38bdf8;}' +
          '.ol-divider{display:flex;align-items:center;text-align:center;color:#6b7280;font-size:12px;margin:16px 0;}' +
          '.ol-divider::before,.ol-divider::after{content:"";flex:1;border-bottom:1px solid #242844;}' +
          '.ol-divider span{padding:0 10px;}' +
          '.ol-status{margin-top:10px;font-size:12px;color:#38bdf8;text-align:center;min-height:18px;}' +
          '.ol-sub{font-size:13px;color:#a6abce;margin:0 0 12px;}' +
          '.ol-player-list{background:#0a0c18;border:1px solid #242844;border-radius:12px;min-height:120px;padding:8px;max-height:180px;overflow-y:auto;}' +
          '.ol-player-row{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;background:#141831;margin-bottom:6px;}' +
          '.ol-empty{text-align:center;color:#6b7280;padding:40px 0;font-size:13px;}';
        document.head.appendChild(style);
        document.body.appendChild(overlay);
      }

      function hideLobby(keepNet) {
        overlay.hidden = true;
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
        window.removeEventListener('keydown', onKeyDown);
        if (!keepNet && net) {
          try { net.close(); } catch (e) {}
        }
      }

      overlay.hidden = false;
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';

      var net = new OmniNet({ gameId: gameId });

      // Tab switching
      var tabs = overlay.querySelectorAll('.ol-tab');
      var panes = overlay.querySelectorAll('.ol-pane');
      tabs.forEach(function (tab) {
        tab.onclick = function () {
          tabs.forEach(function (t) { t.classList.remove('active'); });
          panes.forEach(function (p) { p.classList.remove('active'); });
          tab.classList.add('active');
          var targetPane = overlay.querySelector('#pane-' + tab.dataset.tab);
          if (targetPane) targetPane.classList.add('active');
          if (tab.dataset.tab === 'lan') net.startLanRadar('default');
        };
      });

      // Reset tabs and inputs
      tabs.forEach(function (t, i) { t.classList.toggle('active', i === 0); });
      panes.forEach(function (p, i) { p.classList.toggle('active', i === 0); });
      var roomInfo = overlay.querySelector('#olRoomInfo');
      var createRoomBtn = overlay.querySelector('#olCreateRoomBtn');
      var roomCodeEl = overlay.querySelector('#olRoomCode');
      var hostStatus = overlay.querySelector('#olHostStatus');
      var joinInput = overlay.querySelector('#olJoinInput');
      var joinStatus = overlay.querySelector('#olJoinStatus');
      var headTitle = overlay.querySelector('.ol-head h3');

      if (headTitle) headTitle.textContent = gameTitle + ' · 联机大厅';
      if (createRoomBtn) createRoomBtn.hidden = false;
      if (roomInfo) roomInfo.hidden = true;
      if (roomCodeEl) roomCodeEl.textContent = '—';
      if (hostStatus) hostStatus.textContent = '等待好友加入中…';
      if (joinInput) joinInput.value = '';
      if (joinStatus) joinStatus.textContent = '';

      // Close button
      var closeBtn = overlay.querySelector('#olCloseBtn');
      if (closeBtn) {
        closeBtn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          hideLobby(false);
        };
      }

      overlay.onclick = function (e) {
        if (e.target === overlay) hideLobby(false);
      };

      function onKeyDown(e) {
        if (e.key === 'Escape' && !overlay.hidden) hideLobby(false);
      }
      window.addEventListener('keydown', onKeyDown);

      // Create room
      if (createRoomBtn) {
        createRoomBtn.onclick = function () {
          createRoomBtn.hidden = true;
          if (roomInfo) roomInfo.hidden = false;
          var code = net.createRoom();
          if (roomCodeEl) roomCodeEl.textContent = code;
          if (hostStatus) hostStatus.textContent = '已创建房间 ' + code + '，等待好友加入…';
        };
      }

      // Copy room code
      var copyCodeBtn = overlay.querySelector('#olCopyCodeBtn');
      if (copyCodeBtn) {
        copyCodeBtn.onclick = function () {
          var code = roomCodeEl ? roomCodeEl.textContent : '';
          navigator.clipboard.writeText(code).then(function () {
            if (hostStatus) hostStatus.textContent = '已复制房间码 ' + code + ' 到剪贴板！';
          });
        };
      }

      // Join room input handlers
      if (joinInput) {
        joinInput.oninput = function () {
          this.value = this.value.replace(/\D/g, '').slice(0, 6);
        };
        joinInput.onkeydown = function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (joinBtn) joinBtn.click();
          }
        };
      }

      var joinBtn = overlay.querySelector('#olJoinBtn');
      if (joinBtn) {
        joinBtn.onclick = function () {
          var code = joinInput ? joinInput.value.trim() : '';
          if (code.length !== 6) {
            if (joinStatus) joinStatus.textContent = '请输入完整的 6 位房间密钥！';
            return;
          }
          if (joinStatus) joinStatus.textContent = '正在打洞连接房间 ' + code + '…';
          net.joinRoom(code);
        };
      }

      // Local play
      var localPlayBtn = overlay.querySelector('#olLocalPlayBtn');
      if (localPlayBtn) {
        localPlayBtn.onclick = function () {
          hideLobby(false);
          onReady({ mode: 'local', net: null });
        };
      }

      // Guest joined event for host
      net.on('guestJoined', function () {
        if (hostStatus) hostStatus.textContent = '好友已加入！正在建立 P2P 直连通道…';
      });

      // On connected
      net.on('connected', function (info) {
        if (hostStatus) hostStatus.textContent = '🎉 连接成功！正在进入对决…';
        if (joinStatus) joinStatus.textContent = '🎉 连接成功！正在进入对决…';
        setTimeout(function () {
          hideLobby(true);
          onReady({ mode: 'online', net: net, isHost: info.isHost, opponent: info.opponent });
        }, 350);
      });

      // Radar presence
      var playerList = overlay.querySelector('#olPlayerList');
      var seenPeers = {};
      var peerTimers = {};

      net.on('challenge', function (msg) {
        var challengerName = (msg.profile && msg.profile.nickname) || '局域网好友';
        if (confirm('【局域网对战邀请】' + challengerName + ' 向你发起挑战，是否应战？')) {
          net.acceptChallenge(msg.senderId);
        }
      });

      net.on('challengeAccepted', function (msg) {
        if (hostStatus) hostStatus.textContent = '对方已接受挑战！正在连接…';
      });

      net.on('presence', function (msg) {
        var prof = msg.profile || {};
        var pid = msg.senderId;
        if (!pid || pid === net.myId) return;

        if (peerTimers[pid]) clearTimeout(peerTimers[pid]);
        peerTimers[pid] = setTimeout(function () {
          delete seenPeers[pid];
          var el = playerList.querySelector('[data-pid="' + pid + '"]');
          if (el) el.remove();
          if (playerList.children.length === 0) {
            playerList.innerHTML = '<div class="ol-empty">正在扫描局域网邻居…</div>';
          }
        }, 8000);

        if (!seenPeers[pid]) {
          seenPeers[pid] = true;
          if (playerList.querySelector('.ol-empty')) playerList.innerHTML = '';
          var row = document.createElement('div');
          row.className = 'ol-player-row';
          row.dataset.pid = pid;
          row.innerHTML =
            '<div>' + (prof.avatar || '👤') + ' <b>' + (prof.nickname || '同局域网玩家') + '</b></div>' +
            '<button class="ol-btn small primary">发起挑战</button>';
          row.querySelector('button').onclick = function () {
            net.challengePlayer(pid);
            this.textContent = '已发出邀请…';
            this.disabled = true;
          };
          playerList.appendChild(row);
        }
      });

      return net;
    },

    openLobby: function (gameId, gameTitle, onReady) {
      return this.showLobby({
        gameId: gameId,
        gameTitle: gameTitle,
        onReady: onReady
      });
    }
  };

  global.OmniNet = OmniNet;
  global.OmniNetUI = OmniNetUI;
})(typeof window !== 'undefined' ? window : this);
