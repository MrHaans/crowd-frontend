/**
 * crowd-xclaim-ui.js
 * ============================================================
 */

(function () {
  'use strict';

  const API_BASE = window.XCLAIM_API_BASE || 'http://localhost:3001';
  const POLL_INTERVAL_MS = 5000;

  // ── STATE ─────────────────────────────────────────────────
  let state = {
    wallet:      null,
    agentName:   null,
    claimId:     null,
    pollTimer:   null,
    step:        'idle', // idle | generating | pending | posted | completed | expired
  };

  // ── HTML ─────────────────────────────────────────
  var _xclaimHtml = `
      <section id="xclaim-section" class="xclaim-section">
        <div class="section-header">
          <span class="section-tag">// X-CLAIM REWARD</span>
          <h2 class="section-title">EARN $CROWD</h2>
          <p class="section-sub">
            Post about CROWD Protocol on X — get $CROWD sent to your wallet.
            No API key. No sign-up. Just tweet and earn.
          </p>
        </div>

        <div class="xclaim-card" id="xclaim-card">

          <!-- STEP 0: Connect Wallet -->
          <div class="xclaim-step" id="step-connect">
            <div class="xclaim-reward-badge">
              <span class="reward-amount" id="reward-amount">50</span>
              <span class="reward-unit">$CROWD</span>
              <span class="reward-label">per tweet</span>
            </div>
            <p class="xclaim-desc">
              Connect your Cronos wallet to check eligibility and generate your unique tweet.
            </p>
            <button class="btn-xclaim-primary" id="btn-connect-wallet">
              ⬡ CONNECT WALLET
            </button>
            <p class="xclaim-note">Requires MetaMask or Crypto.com DeFi Wallet on Cronos</p>
          </div>

          <!-- STEP 1: Eligible / Cooldown -->
          <div class="xclaim-step hidden" id="step-eligible">
            <div class="wallet-info">
              <span class="wallet-label">WALLET</span>
              <span class="wallet-addr" id="display-wallet">0x...</span>
            </div>
            <div class="eligibility-status" id="eligibility-status">
              <!-- injected by JS -->
            </div>
            <button class="btn-xclaim-primary" id="btn-generate-tweet">
              ⚡ GENERATE MY TWEET
            </button>
          </div>

          <!-- STEP 2: Tweet Generated — Open Web Intent -->
          <div class="xclaim-step hidden" id="step-tweet">
            <div class="tweet-preview-label">YOUR AGENT'S TWEET</div>
            <div class="tweet-preview" id="tweet-preview-text">
              <!-- teks tweet -->
            </div>
            <div class="xclaim-actions">
              <a class="btn-xclaim-primary" id="btn-open-twitter" href="#" target="_blank" rel="noopener">
                𝕏 OPEN X & POST TWEET
              </a>
              <p class="xclaim-note">
                Klik tombol di atas → X terbuka dengan tweet sudah terisi → klik Post.
              </p>
            </div>
            <div class="divider-label">SETELAH TWEET, PASTE URL DI SINI</div>
            <div class="url-submit-area">
              <input
                type="text"
                id="input-tweet-url"
                class="xclaim-input"
                placeholder="https://x.com/yourname/status/1234567890"
              />
              <button class="btn-xclaim-secondary" id="btn-submit-url">
                SUBMIT & VERIFY
              </button>
            </div>
            <div class="url-error hidden" id="url-error"></div>
          </div>

          <!-- STEP 3: Verifying / Waiting Oracle -->
          <div class="xclaim-step hidden" id="step-verifying">
            <div class="verifying-animation">
              <div class="pulse-ring"></div>
              <span class="verifying-icon">◈</span>
            </div>
            <div class="verifying-title">ORACLE VERIFYING</div>
            <div class="verifying-sub" id="verifying-status-text">
              Checking your tweet on X...
            </div>
            <div class="progress-steps">
              <div class="progress-step done"  id="ps-1">✓ Tweet submitted</div>
              <div class="progress-step active" id="ps-2">◎ Oracle verifying tweet</div>
              <div class="progress-step"        id="ps-3">○ Confirming on Cronos</div>
              <div class="progress-step"        id="ps-4">○ $CROWD sent to wallet</div>
            </div>
          </div>

          <!-- STEP 4: Completed -->
          <div class="xclaim-step hidden" id="step-completed">
            <div class="success-icon">✦</div>
            <div class="success-title">REWARD SENT</div>
            <div class="success-amount">
              <span id="success-reward-amount">50</span> $CROWD
            </div>
            <div class="success-wallet" id="success-wallet-display"></div>
            <a class="btn-xclaim-ghost" id="btn-view-tx" href="#" target="_blank">
              VIEW ON CRONOS EXPLORER ↗
            </a>
            <p class="cooldown-notice" id="cooldown-notice"></p>
            <button class="btn-xclaim-ghost" id="btn-reset">CLAIM AGAIN TOMORROW</button>
          </div>

          <!-- STEP ERROR -->
          <div class="xclaim-step hidden" id="step-error">
            <div class="error-icon">✗</div>
            <div class="error-title" id="error-title">SOMETHING WENT WRONG</div>
            <div class="error-message" id="error-message"></div>
            <button class="btn-xclaim-ghost" id="btn-retry">TRY AGAIN</button>
          </div>

        </div>

        <!-- Pool status -->
        <div class="pool-status" id="pool-status"></div>
      </section>
  `;

  // injectSection
  function injectSection() {
    tryInject();
  }


  // ── HELPERS ───────────────────────────────────────────────
  function buildWebIntentUrl(tweetText) {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
  }

  // ── API CALLS ─────────────────────────────────────────────
  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.message || data.error), { code: data.error });
    return data;
  }

  async function fetchEligibilityPublic() {
    try {
      const status = await apiFetch('/api/status');
      const poolEl = document.getElementById('pool-status');
      if (poolEl) {
        if (status.rewardPool.balance < 100) {
          poolEl.innerHTML = `<span class="pool-warn">⚠ Reward pool low: ${status.rewardPool.balance} $CROWD remaining</span>`;
        } else {
          poolEl.innerHTML = `<span class="pool-ok">◆ Pool: ${status.rewardPool.balance.toLocaleString()} $CROWD available</span>`;
        }
      }
      const rewardEl = document.getElementById('reward-amount');
      if (rewardEl) rewardEl.textContent = status.rewardPool.rewardPerClaim || 50;
    } catch {}
  }

  async function connectWallet() {
    if (!window.ethereum) {
      showError('NO_WALLET', 'MetaMask or Crypto.com DeFi Wallet not detected. Please install one.');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      state.wallet = accounts[0];

      // Switch to Cronos if needed
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x152' }], // 25 in hex = Cronos Mainnet
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          // Chain not in wallet - add automatically
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId:         '0x152',
              chainName:       'Cronos Testnet',
              nativeCurrency:  { name: 'CRO', symbol: 'CRO', decimals: 18 },
              rpcUrls:         ['https://evm-t3.cronos.org'],
              blockExplorerUrls: ['https://explorer.cronos.org/testnet'],
            }],
          });
        }
      }

      // Show eligibility
      document.getElementById('display-wallet').textContent =
        state.wallet.slice(0, 6) + '...' + state.wallet.slice(-4);

      showStep('step-eligible');
      await checkEligibility();
    } catch (err) {
      showError('WALLET_ERROR', err.message);
    }
  }

  async function checkEligibility() {
    try {
      const data = await apiFetch(`/api/claim/eligibility?wallet=${state.wallet}`);
      const el   = document.getElementById('eligibility-status');
      const btn  = document.getElementById('btn-generate-tweet');

      if (data.rewardPoolEmpty) {
        el.innerHTML = `<div class="elig-warn">⚠ Reward pool is empty. Try again later.</div>`;
        btn.disabled = true;
        return;
      }

      if (data.activeClaim) {
        // Normalisasi: pastikan claimId tersedia dalam dua format
        const activeClaim = {
          ...data.activeClaim,
          claim_id: data.activeClaim.claim_id || data.activeClaim.claimId,
          claimId:  data.activeClaim.claim_id || data.activeClaim.claimId,
        };

        state.claimId = activeClaim.claim_id;
        console.log('[xclaim] Resuming claimId:', state.claimId); // debug

        if (!state.claimId) {
          // claimId tetap undefined — clear active claim, mulai fresh
          el.innerHTML = `<div class="elig-ok">✓ Eligible! Reward: <b>${data.rewardAmount} $CROWD</b></div>`;
          btn.disabled = false;
          return;
        }

        el.innerHTML = `<div class="elig-info">◎ You have an active claim. Resuming...</div>`;
        btn.disabled = true;
        await resumeClaim(activeClaim);
        return;
      }

      if (!data.eligible) {
        const h = data.cooldown.remainingHours;
        el.innerHTML = `<div class="elig-cooldown">⏱ Cooldown: ${h} hour${h !== 1 ? 's' : ''} remaining</div>`;
        btn.disabled = true;
        return;
      }

      el.innerHTML = `<div class="elig-ok">✓ Eligible! Reward: <b>${data.rewardAmount} $CROWD</b></div>`;
      btn.disabled = false;
    } catch (err) {
      console.error('eligibility check failed:', err);
    }
  }

  async function generateTweet() {
    const btn = document.getElementById('btn-generate-tweet');
    btn.disabled = true;
    btn.textContent = '⟳ GENERATING...';

    try {
      // Take existed agentName from CROWD state in page
      state.agentName = window.crowdState?.myAgent?.name ||
                        window.agentName ||
                        'AGENT-' + state.wallet.slice(2, 8).toUpperCase();

      const data = await apiFetch('/api/claim/initiate', {
        method: 'POST',
        body: JSON.stringify({
          wallet:    state.wallet,
          agentName: state.agentName,
          agentFuel: window.crowdState?.myAgent?.fuel || 50,
        }),
      });

      state.claimId = data.claimId;
      document.getElementById('input-tweet-url').dataset.claimId = data.claimId;

      // Show tweet preview and intent button
      document.getElementById('tweet-preview-text').textContent = data.tweetText;
      document.getElementById('btn-open-twitter').href = data.webIntentUrl;

      showStep('step-tweet');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '⚡ GENERATE MY TWEET';
      showError(err.code || 'GENERATE_ERROR', err.message);
    }
  }

  async function submitTweetUrl() {
    const url    = document.getElementById('input-tweet-url').value.trim();
    // Ambil dari state, fallback ke data attribute di DOM
    if (!state.claimId) {
      state.claimId = document.getElementById('input-tweet-url').dataset.claimId;
    }
    const btn    = document.getElementById('btn-submit-url');
    const errEl  = document.getElementById('url-error');

    errEl.classList.add('hidden');
    errEl.textContent = '';

    if (!url) {
      errEl.textContent = 'Please paste your tweet URL first.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'VERIFYING...';

    try {
      await apiFetch('/api/claim/submit', {
        method: 'POST',
        body: JSON.stringify({ claimId: state.claimId, tweetUrl: url }),
      });

      showStep('step-verifying');
      startPolling();
    } catch (err) {
      btn.disabled    = false;
      btn.textContent = 'SUBMIT & VERIFY';
      errEl.textContent = err.message || 'Verification failed. Check your URL and try again.';
      errEl.classList.remove('hidden');
    }
  }

  // ── POLLING ───────────────────────────────────────────────
  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(pollClaim, POLL_INTERVAL_MS);
    pollClaim(); // immediate first poll
  }

  async function pollClaim() {
    try {
      const data = await apiFetch(`/api/claim/${state.claimId}`);

      if (data.status === 'COMPLETED') {
        clearInterval(state.pollTimer);
        showCompleted(data);
      } else if (data.status === 'EXPIRED') {
        clearInterval(state.pollTimer);
        showError('CLAIM_EXPIRED', 'Claim expired. The tweet may have been deleted or took too long to verify.');
      } else if (data.status === 'POSTED') {
        // Still process in oracle — update step indicator
        document.getElementById('ps-2').textContent = '◎ Oracle verifying tweet...';
        document.getElementById('ps-3').className = 'progress-step active';
        document.getElementById('ps-3').textContent = '◎ Confirming on Cronos...';
      }
    } catch (err) {
      console.error('Poll error:', err.message);
    }
  }

  async function resumeClaim(activeClaim) {
  state.claimId = activeClaim.claim_id || activeClaim.claimId;

  if (activeClaim.status === 'POSTED') {
    // Sudah submit URL, tinggal tunggu oracle
    showStep('step-verifying');
    startPolling();

  } else if (activeClaim.status === 'PENDING') {
    // Belum submit URL — ambil detail termasuk tweet_text
    try {
      const detail = await apiFetch(`/api/claim/${state.claimId}`);
      state.claimId = detail.claimId;

      if (detail.tweetText) {
        // Tampilkan tweet preview dan Web Intent button
        document.getElementById('tweet-preview-text').textContent = detail.tweetText;
        document.getElementById('btn-open-twitter').href = buildWebIntentUrl(detail.tweetText);
        document.getElementById('input-tweet-url').dataset.claimId = state.claimId;
        showStep('step-tweet');
      } else {
        // tweet_text tidak ada — suruh mulai ulang
        await apiFetch(`/api/claim/eligibility?wallet=${state.wallet}`);
        showStep('step-eligible');
      }
    } catch (err) {
      showStep('step-eligible');
    }
  }
}

  // ── UI HELPERS ────────────────────────────────────────────
  function showStep(stepId) {
    document.querySelectorAll('.xclaim-step').forEach(el => el.classList.add('hidden'));
    document.getElementById(stepId)?.classList.remove('hidden');
    state.step = stepId.replace('step-', '');
  }

  function showError(code, message) {
    // Kalau error dari wallet connection, reset state wallet
    if (code === 'WALLET_ERROR' || code === 'NO_WALLET') {
      state.wallet    = null;
      state.agentName = null;
      state.claimId   = null;
    }
    document.getElementById('error-title').textContent   = code || 'ERROR';
    document.getElementById('error-message').textContent = message || 'Unknown error';
    showStep('step-error');
  }

  function showCompleted(data) {
    document.getElementById('success-reward-amount').textContent = data.rewardAmount || 50;
    document.getElementById('success-wallet-display').textContent =
      `→ ${data.wallet.slice(0, 8)}...${data.wallet.slice(-6)}`;

    if (data.txHashes?.confirm) {
      document.getElementById('btn-view-tx').href =
        `https://explorer.cronos.org/tx/${data.txHashes.confirm}`;
    }

    document.getElementById('cooldown-notice').textContent =
      'Next claim available in 24 hours.';

    showStep('step-completed');
  }

  // ── BIND EVENTS ───────────────────────────────────────────
  function bindEvents() {
    document.getElementById('btn-connect-wallet')
      ?.addEventListener('click', connectWallet);

    document.getElementById('btn-generate-tweet')
      ?.addEventListener('click', generateTweet);

    document.getElementById('btn-submit-url')
      ?.addEventListener('click', submitTweetUrl);

    document.getElementById('input-tweet-url')
      ?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitTweetUrl();
      });

    document.getElementById('btn-retry')
      ?.addEventListener('click', () => {
        state.claimId = null;
        // Kalau wallet belum connect, kembali ke step connect
        if (!state.wallet) {
          showStep('step-connect');
        } else {
          showStep('step-eligible');
          checkEligibility();
        }
      });

    document.getElementById('btn-reset')
      ?.addEventListener('click', () => showStep('step-eligible'));
  }

  // ── CSS ───────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* ── X-CLAIM SECTION ──────────────────────────────── */
      .xclaim-section {
        padding: 60px 24px;
        max-width: 680px;
        margin: 0 auto;
        font-family: 'Share Tech Mono', 'Courier New', monospace;
      }
      .section-header { text-align: center; margin-bottom: 32px; }
      .section-tag { color: #0D9DE0; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; }
      .section-title {
        font-family: 'Orbitron', sans-serif;
        font-size: 28px; color: #fff; margin: 8px 0;
        letter-spacing: 4px;
      }
      .section-sub { color: #6B7280; font-size: 13px; line-height: 1.6; }

      /* ── CARD ─────────────────────────────────────────── */
      .xclaim-card {
        background: #0D1B2A;
        border: 1px solid #1E3A4C;
        border-top: 3px solid #0D9DE0;
        padding: 32px;
        position: relative;
      }
      .xclaim-step.hidden { display: none; }

      /* ── REWARD BADGE ─────────────────────────────────── */
      .xclaim-reward-badge {
        text-align: center;
        margin-bottom: 24px;
        padding: 20px;
        border: 1px dashed #1E3A4C;
        background: #0A0F1A;
      }
      .reward-amount { font-size: 48px; color: #0D9DE0; font-family: 'Orbitron', sans-serif; }
      .reward-unit   { font-size: 18px; color: #94A3B8; margin-left: 6px; }
      .reward-label  { display: block; font-size: 11px; color: #4B6A8A; letter-spacing: 2px; margin-top: 4px; }

      /* ── BUTTONS ──────────────────────────────────────── */
      .btn-xclaim-primary {
        display: block; width: 100%; padding: 14px;
        background: #0D9DE0; color: #fff;
        border: none; cursor: pointer;
        font-family: 'Share Tech Mono', monospace;
        font-size: 14px; letter-spacing: 2px;
        text-decoration: none; text-align: center;
        transition: background 0.2s, transform 0.1s;
        margin-top: 16px;
      }
      .btn-xclaim-primary:hover:not(:disabled) { background: #0B8AC7; transform: translateY(-1px); }
      .btn-xclaim-primary:disabled { background: #1E3A4C; color: #4B6A8A; cursor: not-allowed; }
      .btn-xclaim-secondary {
        padding: 12px 20px; background: transparent;
        border: 1px solid #0D9DE0; color: #0D9DE0;
        cursor: pointer; font-family: 'Share Tech Mono', monospace;
        font-size: 13px; letter-spacing: 1px;
        transition: all 0.2s; white-space: nowrap;
      }
      .btn-xclaim-secondary:hover:not(:disabled) { background: #0D9DE0; color: #fff; }
      .btn-xclaim-secondary:disabled { border-color: #1E3A4C; color: #4B6A8A; cursor: not-allowed; }
      .btn-xclaim-ghost {
        display: block; width: 100%; padding: 12px;
        background: transparent; border: 1px solid #1E3A4C;
        color: #6B7280; cursor: pointer;
        font-family: 'Share Tech Mono', monospace; font-size: 13px;
        text-decoration: none; text-align: center; margin-top: 12px;
        transition: border-color 0.2s, color 0.2s;
      }
      .btn-xclaim-ghost:hover { border-color: #0D9DE0; color: #0D9DE0; }

      /* ── WALLET INFO ──────────────────────────────────── */
      .wallet-info {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; background: #0A0F1A;
        border: 1px solid #1E3A4C; margin-bottom: 16px;
      }
      .wallet-label { font-size: 10px; color: #4B6A8A; letter-spacing: 2px; }
      .wallet-addr  { font-size: 13px; color: #0D9DE0; }

      /* ── ELIGIBILITY ──────────────────────────────────── */
      .elig-ok       { color: #22C55E; font-size: 13px; padding: 8px 0; }
      .elig-cooldown { color: #F59E0B; font-size: 13px; padding: 8px 0; }
      .elig-warn     { color: #EF4444; font-size: 13px; padding: 8px 0; }
      .elig-info     { color: #0D9DE0; font-size: 13px; padding: 8px 0; }

      /* ── TWEET PREVIEW ────────────────────────────────── */
      .tweet-preview-label {
        font-size: 10px; color: #4B6A8A; letter-spacing: 2px; margin-bottom: 8px;
      }
      .tweet-preview {
        background: #0A0F1A; border: 1px solid #1E3A4C;
        border-left: 3px solid #0D9DE0;
        padding: 16px; color: #94A3B8; font-size: 13px;
        line-height: 1.6; white-space: pre-wrap;
        margin-bottom: 20px;
      }
      .xclaim-note { color: #4B6A8A; font-size: 11px; text-align: center; margin-top: 8px; }

      /* ── URL SUBMIT ───────────────────────────────────── */
      .divider-label {
        text-align: center; font-size: 10px; color: #4B6A8A;
        letter-spacing: 2px; margin: 20px 0 12px;
        border-top: 1px solid #1E3A4C; padding-top: 16px;
      }
      .url-submit-area { display: flex; gap: 8px; }
      .xclaim-input {
        flex: 1; padding: 12px; background: #0A0F1A;
        border: 1px solid #1E3A4C; color: #94A3B8;
        font-family: 'Share Tech Mono', monospace; font-size: 12px;
        outline: none; transition: border-color 0.2s;
      }
      .xclaim-input:focus  { border-color: #0D9DE0; }
      .url-error { color: #EF4444; font-size: 12px; margin-top: 8px; }

      /* ── VERIFYING ────────────────────────────────────── */
      .verifying-animation {
        position: relative; width: 60px; height: 60px;
        margin: 0 auto 20px;
      }
      .verifying-icon {
        position: absolute; inset: 0; display: flex;
        align-items: center; justify-content: center;
        font-size: 24px; color: #0D9DE0;
        animation: spin 3s linear infinite;
      }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .pulse-ring {
        position: absolute; inset: 0; border: 2px solid #0D9DE0;
        border-radius: 50%; animation: pulse 1.5s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50%       { transform: scale(1.3); opacity: 0.3; }
      }
      .verifying-title { text-align: center; font-size: 16px; color: #fff; letter-spacing: 3px; }
      .verifying-sub   { text-align: center; color: #6B7280; font-size: 12px; margin: 8px 0 24px; }
      .progress-steps { display: flex; flex-direction: column; gap: 8px; }
      .progress-step       { font-size: 12px; color: #4B6A8A; padding: 6px 0; border-left: 2px solid #1E3A4C; padding-left: 12px; }
      .progress-step.active{ color: #0D9DE0; border-left-color: #0D9DE0; }
      .progress-step.done  { color: #22C55E; border-left-color: #22C55E; }

      /* ── COMPLETED ────────────────────────────────────── */
      .success-icon   { text-align: center; font-size: 40px; color: #22C55E; margin-bottom: 8px; }
      .success-title  { text-align: center; font-size: 18px; color: #fff; letter-spacing: 4px; }
      .success-amount {
        text-align: center; font-size: 36px; color: #0D9DE0;
        font-family: 'Orbitron', sans-serif; margin: 12px 0 4px;
      }
      .success-wallet    { text-align: center; color: #4B6A8A; font-size: 12px; margin-bottom: 20px; }
      .cooldown-notice   { text-align: center; color: #4B6A8A; font-size: 11px; margin-top: 12px; }

      /* ── ERROR ────────────────────────────────────────── */
      .error-icon    { text-align: center; font-size: 36px; color: #EF4444; margin-bottom: 8px; }
      .error-title   { text-align: center; font-size: 16px; color: #EF4444; letter-spacing: 2px; }
      .error-message { text-align: center; color: #6B7280; font-size: 12px; margin: 8px 0 20px; }

      /* ── POOL STATUS ──────────────────────────────────── */
      .pool-status { text-align: center; margin-top: 12px; font-size: 11px; }
      .pool-ok   { color: #22C55E; }
      .pool-warn { color: #F59E0B; }

      /* ── MOBILE ───────────────────────────────────────── */
      @media (max-width: 480px) {
        .xclaim-card    { padding: 20px 16px; }
        .reward-amount  { font-size: 36px; }
        .url-submit-area { flex-direction: column; }
        .btn-xclaim-secondary { width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── INIT — MutationObserver for SPA ───────────────────────

  function tryInject() {
    // Prevent double inject
    if (document.getElementById('xclaim-section')) return;

    const leaderboard = document.querySelector('.leaderboard-section');
    if (!leaderboard) return; // not yet render, wait

    leaderboard.insertAdjacentHTML('afterend', getHtml());
    injectStyles();
    bindEvents();
    fetchEligibilityPublic();
  }

  // Split HTML with function so user can call from tryInject
  function getHtml() {
    // — Taking from DOM String above
    return _xclaimHtml;
  }

  // Observer: react everytime DOM change (router render new page)
  const _observer = new MutationObserver(function() {
    tryInject();
  });
  _observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInject);
  } else {
    tryInject();
  }
})();