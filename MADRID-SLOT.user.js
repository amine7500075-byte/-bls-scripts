// ==UserScript==
// @name         MADRID SLOT
// @namespace    http://tampermonkey.net/
// @version      3.1
// @match        https://algeria.blsspainglobal.com/dza/appointment/slotselection*
// @match        https://algeria.blsspainglobal.com/dza/appointment/visatype*
// @match        https://algeria.blsspainglobal.com/dza/appointment/liveness*
// @match        https://algeria.blsspainglobal.com/dza/appointment/payment*
// @icon         https://cdn.pixabay.com/animation/2022/09/13/17/55/17-55-34-595_512.gif
// @grant        none
// @updateURL    https://raw.githubusercontent.com/YOUR_USERNAME/bls-scripts/main/MADRID-SLOT.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_USERNAME/bls-scripts/main/MADRID-SLOT.user.js
// @run-at       document-idle
// ==/UserScript==

function showNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body: body, icon: "https://cdn.pixabay.com/animation/2022/09/13/17/55/17-55-34-595_512.gif" });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(function(p) {
      if (p === "granted") new Notification(title, { body: body, icon: "https://cdn.pixabay.com/animation/2022/09/13/17/55/17-55-34-595_512.gif" });
    });
  }
}

(function () {
  'use strict';

  try {
    document.querySelectorAll('.preloader').forEach(function(e) { e.style.display = 'none'; });
  } catch (_) {}

  function patchAjax(self) {
    if (!window.$ || !window.$.ajax || window.__SB_AJAX_PATCHED__) return;
    window.__SB_AJAX_PATCHED__ = true;
    var _orig = window.$.ajax.bind(window.$);
    window.$.ajax = function(options) {
      var url = (typeof options === 'string' ? options : (options && options.url)) || '';
      if (url.includes('getavailableslotsbydate')) {
        var origSuccess = options.success;
        options.success = function(data, status, xhr) {
          if (origSuccess) origSuccess.call(this, data, status, xhr);
          if (data && data.success && data.data && data.data.length > 0) {
            self._selectBest(data.data);
          }
        };
      }
      return _orig(options);
    };
  }

  function patchAjaxWithRetry(self) {
    if (window.__SB_AJAX_PATCHED__) return;
    if (window.$ && window.$.ajax) { patchAjax(self); return; }
    var attempts = 0;
    var interval = setInterval(function() {
      attempts++;
      if (window.$ && window.$.ajax) { clearInterval(interval); patchAjax(self); }
      if (attempts > 200) clearInterval(interval);
    }, 50);
  }

  function patchFetch(self) {
    if (window.__SB_FETCH_PATCHED__) return;
    window.__SB_FETCH_PATCHED__ = true;
    var _origFetch = window.fetch;
    window.fetch = function(input, init) {
      var url = (typeof input === 'string' ? input : (input && input.url)) || '';
      var res = _origFetch.call(window, input, init);
      if (url.includes('getavailableslotsbydate')) {
        res.then(function(r) {
          try {
            r.clone().json().then(function(data) {
              if (data && data.success && data.data && data.data.length > 0) {
                self._selectBest(data.data);
              }
            }).catch(function() {});
          } catch(_) {}
        }).catch(function() {});
      }
      return res;
    };
  }

  function patchXHR(self) {
    if (window.__SB_XHR_PATCHED__) return;
    window.__SB_XHR_PATCHED__ = true;
    var _open = XMLHttpRequest.prototype.open;
    var _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this.__sb_url = url;
      return _open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      if (this.__sb_url && this.__sb_url.includes('getavailableslotsbydate')) {
        var xhr = this;
        xhr.addEventListener('load', function() {
          try {
            var data = JSON.parse(xhr.responseText);
            if (data && data.success && data.data && data.data.length > 0) {
              self._selectBest(data.data);
            }
          } catch(_) {}
        });
      }
      return _send.apply(this, arguments);
    };
  }

  function waitForWidgets(maxWaitMs) {
    maxWaitMs = maxWaitMs || 60000;
    return new Promise(function(resolve) {
      function check() {
        return document.querySelector('#ad') &&
               document.querySelector('#AppointmentSlot') &&
               document.querySelector('#btnSubmit');
      }
      if (check()) return resolve(true);
      var start = Date.now();
      var obs = new MutationObserver(function() {
        if (check()) { obs.disconnect(); clearInterval(poll); resolve(true); }
      });
      function startObs() {
        if (document.body) {
          obs.observe(document.body, { childList: true, subtree: true });
        } else {
          setTimeout(startObs, 20);
        }
      }
      startObs();
      var poll = setInterval(function() {
        if (check()) { obs.disconnect(); clearInterval(poll); resolve(true); }
        if (Date.now() - start > maxWaitMs) { obs.disconnect(); clearInterval(poll); resolve(false); }
      }, 50);
    });
  }

  function SlotBot() {
    this.BLUE = '#0b1f3a';
    this.notifiedForThisRun = false;
  }

  SlotBot.prototype.start = function() {
    patchAjaxWithRetry(this);
    patchFetch(this);
    patchXHR(this);
    this._buildUI();
    this._hookFlatpickr();
    this._watchAndSelectDate();
  };

  SlotBot.prototype._buildUI = function() {
    var cal = document.querySelector('#ad');
    var host = cal ? cal.closest('div') : document.body;
    if (!document.getElementById('sb-status')) {
      var d = document.createElement('div');
      d.id = 'sb-status';
      d.style.cssText = 'margin-top:8px;font-size:14px;font-weight:700;color:' + this.BLUE + ';';
      if (host) host.appendChild(d);
    }
  };

  SlotBot.prototype._status = function(msg) {
    var e = document.getElementById('sb-status');
    if (e) e.textContent = msg;
    console.debug('[SlotBot]', msg);
  };

  SlotBot.prototype._hookFlatpickr = function() {
    var cal = document.querySelector('#ad');
    if (!cal || !cal._flatpickr) return;
    var fp = cal._flatpickr;
    if (!Array.isArray(fp.config.onChange)) fp.config.onChange = [];
    fp.config.onChange.push(function() {
      window.__SB_SUBMITTED__ = false;
    });
  };

  SlotBot.prototype._watchAndSelectDate = function() {
    var self = this;
    function trySelect() {
      var days = document.querySelectorAll('.flatpickr-day.available-day:not(.flatpickr-disabled)');
      if (days.length) {
        var randomIndex = Math.floor(Math.random() * days.length);
        self._status(' Selecting date...');
        days[randomIndex].click();
        setTimeout(function() { patchAjaxWithRetry(self); }, 0);
        return true;
      }
      return false;
    }
    if (trySelect()) return;
    var obs = new MutationObserver(function() {
      if (trySelect()) obs.disconnect();
    });
    function startObs() {
      if (document.body) {
        obs.observe(document.body, {
          childList: true, subtree: true,
          attributes: true, attributeFilter: ['class']
        });
      } else {
        setTimeout(startObs, 20);
      }
    }
    startObs();
    var cal = document.querySelector('#ad');
    var fp = cal && cal._flatpickr;
    if (fp) {
      if (!Array.isArray(fp.config.onReady)) fp.config.onReady = [];
      fp.config.onReady.push(function() { if (trySelect()) obs.disconnect(); });
    }
  };

  SlotBot.prototype._selectBest = function(slots) {
    if (window.__SB_SUBMITTED__) return;
    var self = this;

    var available = slots.filter(function(s) { return Number(s.Count) > 0; });
    if (!available.length) { this._status('No slots'); return; }

    if (!this.notifiedForThisRun) {
      this.notifiedForThisRun = true;
      showNotification("Slot available!", "The bot found a slot and will book it.");
      try {
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.9;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 1);
      } catch(e) {}
    }

    var randomIndex = Math.floor(Math.random() * available.length);
    var best = available[randomIndex];

    var slotEl = document.querySelector('#AppointmentSlot');
    var ts = slotEl && slotEl.tomselect;
    if (!ts) { this._status('TomSelect not found'); return; }

    var tsOptions = ts.options;
    var tsKeys = Object.keys(tsOptions);

    var chosenKey = null;
    if (best.Id !== undefined && tsOptions[String(best.Id)]) {
      chosenKey = String(best.Id);
    } else if (best.Name && tsOptions[best.Name]) {
      chosenKey = best.Name;
    } else {
      for (var i = 0; i < tsKeys.length; i++) {
        var opt = tsOptions[tsKeys[i]];
        if (opt.text === best.Name || opt.text === best.TimeText ||
            String(opt.value) === String(best.Id)) {
          chosenKey = tsKeys[i];
          break;
        }
      }
      if (!chosenKey && tsKeys.length) chosenKey = tsKeys[0];
    }

    if (!chosenKey) { this._status('No option found'); return; }

    var label = tsOptions[chosenKey] ? tsOptions[chosenKey].text : chosenKey;
    this._status(' ' + label + ' → Submit...');

    ts.setValue(chosenKey, true);

    var got = String(ts.getValue());
    if (got && got !== '' && got !== 'undefined') {
      self._submit();
      return;
    }

    ts.open();
    setTimeout(function() {
      var drop = document.querySelector('#AppointmentSlot-ts-dropdown');
      var opt = drop && (
        drop.querySelector('[data-value="' + chosenKey + '"]') ||
        drop.querySelector('.option:not(.disabled)')
      );
      if (opt) {
        opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        opt.click();
      }
      self._submit();
    }, 0);
  };

  SlotBot.prototype._submit = function() {
    if (window.__SB_SUBMITTED__) return;
    window.__SB_SUBMITTED__ = true;
    this._fill('ResponseData', (document.querySelector('input[name="ResponseData"]') || {}).value || '{}');
    this._fill('AppointmentFor', (document.querySelector('input[name="AppointmentFor"]') || {}).value || '');
    this._fill('SearchDate', 'false');
    var btn = document.querySelector('#btnSubmit');
    if (!btn) { this._status('btnSubmit not found'); return; }
    btn.disabled = false;
    btn.removeAttribute('disabled');
    try {
      if (typeof window.OnSubmitSlotSelection === 'function') {
        window.OnSubmitSlotSelection();
        this._status(' ');
        return;
      }
    } catch(e) {}
    var form = btn.closest('form') || document.querySelector('form');
    if (form) {
      try { form.submit(); this._status(' form.submit()!'); return; } catch(e) {}
    }
    btn.click();
    this._status(' btn.click()!');
  };

  SlotBot.prototype._fill = function(name, value) {
    var inp = document.querySelector('input[name="' + name + '"]');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'hidden';
      inp.name = name;
      (document.querySelector('form') || document.body).appendChild(inp);
    }
    inp.value = value || '';
  };

  var _earlyBot = new SlotBot();
  patchAjaxWithRetry(_earlyBot);
  patchFetch(_earlyBot);
  patchXHR(_earlyBot);

  if (window.__SB_STARTED__) return;
  window.__SB_STARTED__ = true;

  waitForWidgets(60000).then(function(found) {
    if (!found) { console.warn('[SlotBot] widgets not found'); return; }
    _earlyBot.start();
    console.debug('[SlotBot] started ⚡');
  });

})();

// صفحة applicant selection — صوت + travel date تلقائي
if (window.location.href.includes('/dza/appointment/slotselection')) {
  speechSynthesis.speak(new SpeechSynthesisUtterance('Applicant Selection amine !!!'));
  setTimeout(function() {
    var travelDateInput = document.querySelector('#TravelDate');
    if (!travelDateInput) return;
    var date = new Date();
    date.setMonth(date.getMonth() + 2);
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    var formatted = year + '-' + month + '-' + day;
    var fp = travelDateInput._flatpickr;
    if (fp) {
      fp.setDate(formatted, true);
    } else {
      travelDateInput.removeAttribute('readonly');
      travelDateInput.value = formatted;
      travelDateInput.dispatchEvent(new Event('change', { bubbles: true }));
      travelDateInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    console.debug('[SlotBot] TravelDate set to', formatted);
  }, 2000);
}

// Liveness
if (window.location.href.includes('/dza/appointment/liveness')) {
  setTimeout(function() {
    var btn = document.querySelector('button.btn.btn-success[type="submit"][onclick*="OnLivenessSubmit"]');
    if (btn) btn.click();
  }, 3000);
}

// Payment
if (window.location.href.includes('/dza/appointment/payment')) {
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  async function handlePaymentPage() {
    await sleep(1000);
    while (true) {
      var skipBtn = Array.from(document.querySelectorAll('button.btn.btn-default'))
        .find(function(b) { return b.textContent.trim() === 'Skip' && b.offsetParent !== null; });
      if (!skipBtn) break;
      skipBtn.click();
      await sleep(500);
    }
    await sleep(1000);
    var payBtn = document.getElementById('btnPayAmount');
    if (payBtn && !payBtn.disabled) payBtn.click();
    await sleep(1000);
    var acceptBtn = document.getElementById('payConfirm');
    if (acceptBtn && !acceptBtn.disabled) acceptBtn.click();
  }
  handlePaymentPage();
}