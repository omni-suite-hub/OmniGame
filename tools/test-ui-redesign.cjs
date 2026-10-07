const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = './';
const PORT = 8946;
const CDP_PORT = 9223;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); res.end('404'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const srv = await serve();
  console.log(`Local test server on port ${PORT}`);

  const chromeProc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=/tmp/omnigame-test-chrome-profile',
    '--no-first-run',
    '--no-default-browser-check'
  ], { stdio: 'ignore' });

  await sleep(1500);

  try {
    const versionRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const versionData = await versionRes.json();
    console.log('Connected to Chrome:', versionData.Browser);

    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${PORT}/popup.html`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    console.log('Created tab for popup.html:', tabData.id);

    const wsUrl = tabData.webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);

    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await sleep(800);

    // 1. Check category tabs in popup.html
    console.log('\n--- Checking popup.html Categories ---');
    const catCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const origPill = document.querySelector('.popup-cat-pill[data-cat="original"]');
        const badge = document.getElementById('popupOriginalBadge');
        return {
          hasOrigPill: !!origPill,
          origText: origPill ? origPill.textContent.trim() : null,
          badgeText: badge ? badge.textContent.trim() : null
        };
      })()`,
      returnByValue: true
    });
    console.log('Category check:', catCheck.result.value);

    // 2. Click original pill and count filtered games
    console.log('\n--- Clicking 自研原创 pill in popup.html ---');
    const filterCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const origPill = document.querySelector('.popup-cat-pill[data-cat="original"]');
        origPill.click();
        const cards = document.querySelectorAll('#grid .card');
        const countBadge = document.getElementById('popupCountBadge');
        return {
          cardCount: cards.length,
          countBadgeText: countBadge ? countBadge.textContent : null,
          firstGame: cards[0] ? cards[0].querySelector('.card-name')?.textContent : null
        };
      })()`,
      returnByValue: true
    });
    console.log('Filtered games check:', filterCheck.result.value);

    // 3. Launch a game and verify player bar buttons
    console.log('\n--- Launching game and checking Player Bar in popup.html ---');
    const playerCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const firstCard = document.querySelector('#grid .card');
        if (firstCard) firstCard.click();
        const player = document.getElementById('player');
        const isPlayerVisible = !player.classList.contains('hidden');
        const title = document.getElementById('playerTitle')?.textContent;

        const backBtn = document.getElementById('backBtn');
        const restartBtn = document.getElementById('restartBtn');
        const favBtn = document.getElementById('playerFavBtn');
        const howBtn = document.getElementById('howBtn');
        const tabBtn = document.getElementById('tabBtn');
        const muteBtn = document.getElementById('playerMuteBtn');

        return {
          isPlayerVisible,
          title,
          buttons: {
            back: { hasSvg: !!backBtn.querySelector('svg'), text: backBtn.querySelector('.player-btn-label')?.textContent },
            restart: { hasSvg: !!restartBtn.querySelector('svg'), text: restartBtn.querySelector('.player-btn-label')?.textContent },
            fav: { hasSvg: !!favBtn.querySelector('svg'), text: favBtn.querySelector('.player-btn-label')?.textContent, isFav: favBtn.classList.contains('active') },
            how: { hasSvg: !!howBtn.querySelector('svg'), text: howBtn.querySelector('.player-btn-label')?.textContent },
            tab: { hasSvg: !!tabBtn.querySelector('svg'), text: tabBtn.querySelector('.player-btn-label')?.textContent },
            mute: { hasSvg: !!muteBtn.querySelector('svg'), isMuted: muteBtn.classList.contains('active') }
          }
        };
      })()`,
      returnByValue: true
    });
    console.log('Player Bar check:', JSON.stringify(playerCheck.result.value, null, 2));

    // 4. Test toggling favorite button
    console.log('\n--- Testing Favorite Toggle ---');
    const favToggleCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const favBtn = document.getElementById('playerFavBtn');
        favBtn.click();
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              text: favBtn.querySelector('.player-btn-label')?.textContent,
              isActive: favBtn.classList.contains('active'),
              svgFill: favBtn.querySelector('svg')?.getAttribute('fill')
            });
          }, 100);
        });
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Favorite toggle check:', favToggleCheck.result.value);

    // 5. Test toggling mute button
    console.log('\n--- Testing Mute Toggle ---');
    const muteToggleCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const muteBtn = document.getElementById('playerMuteBtn');
        muteBtn.click();
        return {
          isActive: muteBtn.classList.contains('active'),
          hasSvg: !!muteBtn.querySelector('svg')
        };
      })()`,
      returnByValue: true
    });
    console.log('Mute toggle check:', muteToggleCheck.result.value);

    // Take screenshot of popup player
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/omnigame-popup-player.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved screenshot: /tmp/omnigame-popup-player.png');

    // 6. Test surface.html
    console.log('\n=======================================');
    console.log('--- Testing surface.html ---');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/surface.html` });
    await sleep(1000);

    const surfCatCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const origPill = document.querySelector('.surf-cat-pill[data-cat="original"]');
        const badge = document.getElementById('origCountBadge');
        return {
          hasOrigPill: !!origPill,
          origText: origPill ? origPill.textContent.trim() : null,
          badgeText: badge ? badge.textContent.trim() : null
        };
      })()`,
      returnByValue: true
    });
    console.log('Surface Category check:', surfCatCheck.result.value);

    const surfFilterCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const origPill = document.querySelector('.surf-cat-pill[data-cat="original"]');
        origPill.click();
        const cards = document.querySelectorAll('#grid .surf-card');
        const countBadge = document.getElementById('surfCountBadge');
        return {
          cardCount: cards.length,
          countBadgeText: countBadge ? countBadge.textContent : null,
          firstGame: cards[0] ? cards[0].querySelector('.surf-title')?.textContent : null
        };
      })()`,
      returnByValue: true
    });
    console.log('Surface Filtered games check:', surfFilterCheck.result.value);

    const surfPlayerCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const firstCard = document.querySelector('#grid .surf-card');
        if (firstCard) firstCard.click();
        const player = document.getElementById('player');
        const isPlayerVisible = !player.classList.contains('hidden');
        const title = document.getElementById('playerTitle')?.textContent;

        const backBtn = document.getElementById('backBtn');
        const restartBtn = document.getElementById('restartBtn');
        const favBtn = document.getElementById('playerFavBtn');
        const howBtn = document.getElementById('howBtn');
        const tabBtn = document.getElementById('tabBtn');
        const muteBtn = document.getElementById('playerMuteBtn');

        return {
          isPlayerVisible,
          title,
          buttons: {
            back: { hasSvg: !!backBtn.querySelector('svg'), text: backBtn.querySelector('.surf-btn-label')?.textContent },
            restart: { hasSvg: !!restartBtn.querySelector('svg'), text: restartBtn.querySelector('.surf-btn-label')?.textContent },
            fav: { hasSvg: !!favBtn.querySelector('svg'), text: favBtn.querySelector('.surf-btn-label')?.textContent, isFav: favBtn.classList.contains('active') },
            how: { hasSvg: !!howBtn.querySelector('svg'), text: howBtn.querySelector('.surf-btn-label')?.textContent },
            tab: { hasSvg: !!tabBtn.querySelector('svg'), text: tabBtn.querySelector('.surf-btn-label')?.textContent },
            mute: { hasSvg: !!muteBtn.querySelector('svg'), isMuted: muteBtn.classList.contains('active') }
          }
        };
      })()`,
      returnByValue: true
    });
    console.log('Surface Player Bar check:', JSON.stringify(surfPlayerCheck.result.value, null, 2));

    const surfShot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/omnigame-surface-player.png', Buffer.from(surfShot.data, 'base64'));
    console.log('Saved screenshot: /tmp/omnigame-surface-player.png');

    ws.close();
  } finally {
    chromeProc.kill('SIGKILL');
    srv.close();
  }
}

main().catch(console.error);
