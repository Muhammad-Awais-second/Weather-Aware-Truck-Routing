const http = require('http');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.resolve(__dirname, 'docs', 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function getNextDay0600() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

http.get('http://127.0.0.1:9222/json', (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', async () => {
    const targets = JSON.parse(data);
    const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('chrome-extension'));
    if (!page) {
      console.error('No page target found');
      process.exit(1);
    }
    console.log('Connecting to target:', page.title, page.url);
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    let msgId = 1;
    const pendingCallbacks = new Map();

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pendingCallbacks.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result?.value;
    }

    async function captureScreenshot(filepath) {
      const res = await send('Page.captureScreenshot', {
        format: 'png',
      });
      const buffer = Buffer.from(res.data, 'base64');
      fs.writeFileSync(filepath, buffer);
      console.log(`Saved screenshot: ${filepath} (${(buffer.length / 1024).toFixed(1)} KB)`);
    }

    async function mouseClick(x, y) {
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
      await delay(50);
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pendingCallbacks.has(msg.id)) {
        const { resolve } = pendingCallbacks.get(msg.id);
        pendingCallbacks.delete(msg.id);
        resolve(msg.result);
      }
    };

    ws.onopen = async () => {
      try {
        console.log('Enabling Page, Runtime, DOM & Input...');
        await send('Page.enable');
        await send('Runtime.enable');
        await send('DOM.enable');

        console.log('Setting viewport to 1440x900, deviceScaleFactor: 1');
        await send('Emulation.setDeviceMetricsOverride', {
          width: 1440,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });

        console.log('Navigating to https://weather-aware-truck-routing-liard.vercel.app');
        await send('Page.navigate', {
          url: 'https://weather-aware-truck-routing-liard.vercel.app',
        });

        await delay(3500);
        const depTime = getNextDay0600();

        async function fillAndSubmit(originText, destText) {
          console.log(`\n=== Filling form: ${originText} -> ${destText} ===`);

          // 1. Origin
          await evaluate(`(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
            const input = inputs[0];
            input.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            setter.call(input, ${JSON.stringify(originText)});
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('focus', { bubbles: true }));
          })()`);

          console.log('Waiting for origin suggestions...');
          let originFound = null;
          for (let i = 0; i < 20; i++) {
            await delay(300);
            originFound = await evaluate(`(() => {
              const buttons = Array.from(document.querySelectorAll('div.absolute.z-30 button'));
              const match = buttons.find(b => b.textContent.toLowerCase().includes(${JSON.stringify(originText.split(',')[0].toLowerCase())})) || buttons[0];
              if (match) {
                const label = match.textContent.trim();
                match.click();
                return label;
              }
              return null;
            })()`);
            if (originFound) break;
          }
          console.log('Origin picked:', originFound);
          await delay(400);

          // 2. Destination
          await evaluate(`(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
            const input = inputs[1];
            input.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            setter.call(input, ${JSON.stringify(destText)});
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('focus', { bubbles: true }));
          })()`);

          console.log('Waiting for destination suggestions...');
          let destFound = null;
          for (let i = 0; i < 20; i++) {
            await delay(300);
            destFound = await evaluate(`(() => {
              const buttons = Array.from(document.querySelectorAll('div.absolute.z-30 button'));
              const match = buttons.find(b => b.textContent.toLowerCase().includes(${JSON.stringify(destText.split(',')[0].toLowerCase())})) || buttons[0];
              if (match) {
                const label = match.textContent.trim();
                match.click();
                return label;
              }
              return null;
            })()`);
            if (destFound) break;
          }
          console.log('Destination picked:', destFound);
          await delay(400);

          // 3. Departure & Weight
          await evaluate(`(() => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            const depInput = document.querySelector('input[type="datetime-local"]');
            if (depInput) {
              setter.call(depInput, ${JSON.stringify(depTime)});
              depInput.dispatchEvent(new Event('input', { bubbles: true }));
              depInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const weightInput = document.querySelector('input[type="number"]');
            if (weightInput) {
              setter.call(weightInput, '45000');
              weightInput.dispatchEvent(new Event('input', { bubbles: true }));
              weightInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()`);

          // Submit
          console.log('Clicking Submit Plan button...');
          await evaluate(`(() => {
            const submitBtn = document.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.click();
          })()`);

          // Wait for plan calculation
          console.log('Waiting for plan calculation...');
          let loaded = false;
          for (let i = 0; i < 45; i++) {
            await delay(1000);
            const status = await evaluate(`(() => {
              const body = document.body.innerText;
              const hasRoutes = body.includes('ROUTE COMPARISON') || body.includes('Route Comparison');
              const isLoading = body.includes('Analyzing Weather') || body.includes('CALCULATING WEATHER-RISK');
              const hasMap = !!window.__map && window.__map.isStyleLoaded();
              return { hasRoutes, isLoading, hasMap };
            })()`);
            if (status.hasRoutes && !status.isLoading && status.hasMap) {
              loaded = true;
              console.log('Plan calculation complete!');
              break;
            }
            process.stdout.write('.');
          }
          if (!loaded) throw new Error('Planning timed out');

          // Wait for map idle / rendering
          console.log('\nAllowing map tiles and checkpoints to settle...');
          await delay(5000);

          // Check rendered checkpoints
          const checkpointStats = await evaluate(`(() => {
            const map = window.__map;
            if (!map) return null;
            const features = map.queryRenderedFeatures({ layers: ['checkpoints-layer'] }) || [];
            const levels = {};
            features.forEach(f => {
              const l = f.properties.level;
              levels[l] = (levels[l] || 0) + 1;
            });
            return { total: features.length, levels };
          })()`);
          console.log('Checkpoints rendered on screen:', checkpointStats);
          return checkpointStats;
        }

        // Run Denver -> Salt Lake City
        let stats = await fillAndSubmit('Denver, CO', 'Salt Lake City, UT');
        const hasRisk = stats && Object.keys(stats.levels).some(l => l !== 'Low' && stats.levels[l] > 0);
        if (!hasRisk) {
          console.log('\nEvery rendered checkpoint is Low risk for Denver -> Salt Lake City.');
          console.log('Switching to Cheyenne, WY -> Billings, MT as requested in prompt...');
          stats = await fillAndSubmit('Cheyenne, WY', 'Billings, MT');
        }

        // 1. Capture 01-routes-and-map.png
        console.log('\n--- 1. Capturing 01-routes-and-map.png ---');
        await evaluate(`(() => {
          const aside = document.querySelector('aside');
          if (aside) aside.scrollTop = 0;
        })()`);
        await delay(1500);
        await captureScreenshot(path.join(SCREENSHOT_DIR, '01-routes-and-map.png'));

        // 2. Open popup and capture 02-checkpoint-popup.png
        console.log('\n--- 2. Opening checkpoint popup ---');
        const targetPt = await evaluate(`(() => {
          const map = window.__map;
          if (!map) return null;
          const features = map.queryRenderedFeatures({ layers: ['checkpoints-layer'] }) || [];
          if (features.length === 0) return null;

          // Find non-low or a prominent checkpoint near the center
          const nonLow = features.find(f => f.properties.level !== 'Low');
          const target = nonLow || features[Math.floor(features.length / 2)];
          const coords = target.geometry.coordinates;
          const pt = map.project(coords);
          const rect = map.getCanvas().getBoundingClientRect();

          return {
            coords,
            x: rect.left + pt.x,
            y: rect.top + pt.y,
            props: target.properties
          };
        })()`);

        if (!targetPt) {
          throw new Error('No rendered checkpoint found to click.');
        }

        console.log(`Clicking checkpoint at screen (${Math.round(targetPt.x)}, ${Math.round(targetPt.y)}): Mile ${targetPt.props.mile} (${targetPt.props.level})`);
        // Dispatch mouse click
        await mouseClick(targetPt.x, targetPt.y);
        await delay(1000);

        // Verify popup is open in DOM
        const popupExists = await evaluate(`!!document.querySelector('.maplibregl-popup')`);
        console.log('Popup DOM element exists:', popupExists);

        if (!popupExists) {
          // Fallback: trigger map click directly with feature
          console.log('Trying direct map.fire fallback...');
          await evaluate(`(() => {
            const map = window.__map;
            const features = map.queryRenderedFeatures({ layers: ['checkpoints-layer'] }) || [];
            const target = features[Math.floor(features.length / 2)];
            const [lon, lat] = target.geometry.coordinates;
            map.fire('click', {
              point: map.project([lon, lat]),
              lngLat: { lng: lon, lat: lat },
              features: [target]
            });
          })()`);
          await delay(1000);
        }

        const finalPopupCheck = await evaluate(`(() => {
          const p = document.querySelector('.maplibregl-popup');
          return p ? p.innerText.slice(0, 100) : null;
        })()`);
        console.log('Popup content preview:', finalPopupCheck);

        if (!finalPopupCheck) {
          throw new Error('Could not open checkpoint popup.');
        }

        console.log('Capturing 02-checkpoint-popup.png...');
        await captureScreenshot(path.join(SCREENSHOT_DIR, '02-checkpoint-popup.png'));

        // 3. Move heatmap slider to +12h and capture 03-heatmap-slider.png
        console.log('\n--- 3. Capturing 03-heatmap-slider.png ---');
        await evaluate(`(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const plus12 = buttons.find(b => b.textContent.trim() === '+12h');
          if (plus12) plus12.click();

          const heatmapBtn = buttons.find(b => b.textContent.includes('Heatmap'));
          if (heatmapBtn && heatmapBtn.textContent.includes('Heatmap Hidden')) {
            heatmapBtn.click();
          }
        })()`);
        await delay(2000);
        await captureScreenshot(path.join(SCREENSHOT_DIR, '03-heatmap-slider.png'));

        // 4. Scroll to route cards and capture 04-route-cards.png
        console.log('\n--- 4. Capturing 04-route-cards.png ---');
        await evaluate(`(() => {
          const aside = document.querySelector('aside');
          const routeCards = Array.from(document.querySelectorAll('div')).find(d => d.textContent.includes('ROUTE COMPARISON') || d.textContent.includes('Route Comparison'));
          if (routeCards) {
            routeCards.scrollIntoView({ behavior: 'instant', block: 'start' });
          } else if (aside) {
            aside.scrollTop = 380;
          }
        })()`);
        await delay(1500);
        await captureScreenshot(path.join(SCREENSHOT_DIR, '04-route-cards.png'));

        console.log('\nAll 4 screenshots verified and saved successfully!');
        ws.close();
        process.exit(0);
      } catch (err) {
        console.error('Fatal error during capture:', err);
        ws.close();
        process.exit(1);
      }
    };
  });
});
