/*
 * games/_shared/storage.js
 * Unified persistence layer for OmniGame.
 *
 * - In an extension context it uses chrome.storage.local (requires the
 *   "storage" permission, which the manifest declares).
 * - As a static-file fallback (e.g. `python3 -m http.server` local preview)
 *   it transparently degrades to window.localStorage so the games still
 *   remember scores during development.
 *
 * All methods return Promises so callers can stay async-agnostic.
 */
(function (global) {
  'use strict';

  var PREFIX = 'omnigame:';

  function isChromeStorageValid() {
    try {
      return typeof chrome !== 'undefined' &&
        !!chrome.runtime &&
        !!chrome.runtime.id &&
        typeof chrome.runtime.getManifest === 'function' &&
        !!chrome.runtime.getManifest() &&
        !!chrome.storage &&
        !!chrome.storage.local;
    } catch (e) {
      return false;
    }
  }

  function rawGet(key) {
    return new Promise(function (resolve) {
      if (isChromeStorageValid()) {
        try {
          var p = chrome.storage.local.get(PREFIX + key, function (obj) {
            if (chrome.runtime && chrome.runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(obj && obj[PREFIX + key] != null ? obj[PREFIX + key] : null);
          });
          if (p && typeof p.catch === 'function') {
            p.catch(function () {
              resolve(null);
            });
          }
        } catch (e) {
          resolve(null);
        }
      } else {
        try {
          var r = localStorage.getItem(PREFIX + key);
          resolve(r == null ? null : JSON.parse(r));
        } catch (e) {
          resolve(null);
        }
      }
    }).catch(function () {
      return null;
    });
  }

  function rawSet(key, val) {
    return new Promise(function (resolve) {
      if (isChromeStorageValid()) {
        try {
          var payload = {};
          payload[PREFIX + key] = val;
          var p = chrome.storage.local.set(payload, function () {
            resolve(val);
          });
          if (p && typeof p.catch === 'function') {
            p.catch(function () {
              resolve(val);
            });
          }
        } catch (e) {
          resolve(val);
        }
      } else {
        try {
          localStorage.setItem(PREFIX + key, JSON.stringify(val));
        } catch (e) {
          /* quota / disabled storage — ignore */
        }
        resolve(val);
      }
    }).catch(function () {
      return val;
    });
  }

  var GameStore = {
    backend: isChromeStorageValid() ? 'chrome.storage.local' : 'localStorage',

    /* Higher is better (score-style games). */
    getBest: function (id) {
      return rawGet('best:' + id);
    },
    setBest: function (id, val) {
      return rawGet('best:' + id).then(function (cur) {
        if (cur == null || val > cur) return rawSet('best:' + id, val);
        return cur;
      });
    },

    /* Lower is better (time-style games, milliseconds). */
    getBestTime: function (id) {
      return rawGet('time:' + id);
    },
    setBestTime: function (id, ms) {
      return rawGet('time:' + id).then(function (cur) {
        if (cur == null || ms < cur) return rawSet('time:' + id, ms);
        return cur;
      });
    },

    recordPlay: function (id) {
      var self = this;
      rawSet('last:' + id, Date.now());
      return self.addRecent(id);
    },

    /* Favorites (常用收藏) */
    getFavorites: function () {
      return rawGet('favorites').then(function (favs) {
        return Array.isArray(favs) ? favs : [];
      });
    },
    setFavorites: function (favs) {
      return rawSet('favorites', Array.isArray(favs) ? favs : []);
    },
    toggleFavorite: function (id) {
      var self = this;
      return self.getFavorites().then(function (list) {
        var idx = list.indexOf(id);
        var isFav = false;
        if (idx === -1) {
          list.unshift(id);
          isFav = true;
        } else {
          list.splice(idx, 1);
          isFav = false;
        }
        return self.setFavorites(list).then(function () {
          return isFav;
        });
      });
    },
    isFavorite: function (id) {
      return this.getFavorites().then(function (list) {
        return list.indexOf(id) !== -1;
      });
    },

    /* Recently played (最近常玩，按时间倒序) */
    getRecents: function () {
      return rawGet('recent_games').then(function (recents) {
        return Array.isArray(recents) ? recents : [];
      });
    },
    addRecent: function (id) {
      var self = this;
      return self.getRecents().then(function (list) {
        var filtered = list.filter(function (x) { return x !== id; });
        filtered.unshift(id);
        if (filtered.length > 12) filtered.length = 12;
        return rawSet('recent_games', filtered);
      });
    },
    clearRecents: function () {
      return rawSet('recent_games', []);
    },

    /* Master Mute State (全局静音/摸鱼模式) */
    getMasterMute: function () {
      return rawGet('master_muted').then(function (v) {
        return !!v;
      });
    },
    setMasterMute: function (muted) {
      try {
        localStorage.setItem('omnigame:masterMute', muted ? '1' : '0');
      } catch (e) {}
      return rawSet('master_muted', !!muted);
    },
    isMasterMutedSync: function () {
      try {
        return localStorage.getItem('omnigame:masterMute') === '1' || localStorage.getItem('omnigame:master_muted') === 'true';
      } catch (e) {
        return false;
      }
    },

    /* Player profile (nickname, avatar, elo) */
    getProfile: function () {
      return rawGet('profile').then(function (p) {
        return p || { nickname: '玩家' + Math.floor(1000 + Math.random() * 9000), avatar: '🐱', elo: 1200 };
      });
    },
    setProfile: function (profile) {
      return rawSet('profile', profile);
    },

    /* Multiplayer battle history */
    getBattles: function (gameId) {
      return rawGet('battles').then(function (list) {
        var all = list || [];
        if (!gameId) return all;
        return all.filter(function (b) { return b.gameId === gameId; });
      });
    },
    recordBattle: function (battle) {
      var self = this;
      return self.getBattles().then(function (list) {
        var entry = Object.assign({
          id: 'bt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          time: Date.now()
        }, battle);
        list.unshift(entry);
        if (list.length > 50) list.length = 50; // keep recent 50
        return rawSet('battles', list).then(function () {
          // Update Elo
          return self.getProfile().then(function (prof) {
            var k = 32;
            var change = 0;
            if (battle.result === 'win') change = 16;
            else if (battle.result === 'loss') change = -14;
            prof.elo = Math.max(800, (prof.elo || 1200) + change);
            return self.setProfile(prof).then(function () { return entry; });
          });
        });
      });
    }
  };

  global.GameStore = GameStore;
})(typeof window !== 'undefined' ? window : this);
