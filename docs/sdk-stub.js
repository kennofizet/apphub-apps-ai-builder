/**
 * App Hub bridge SDK stub — copy into hosted app bundle or load via script tag.
 * Channel: apphub:bridge
 */
(function () {
  if (typeof window === 'undefined') return;

  const CHANNEL = 'apphub:bridge';
  const pending = new Map();
  let context = null;

  function handleMessage(event) {
    const data = event.data;
    if (!data || data.channel !== CHANNEL) return;

    if (data.event === 'apphub:bridge:ready') {
      context = data.context || null;
      window.dispatchEvent(new CustomEvent('apphub:bridge:ready', { detail: context }));
      return;
    }

    if (data.event === 'apphub:bridge:result') {
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.ok) entry.resolve(data.result);
      else entry.reject(new Error(data.error || 'Bridge call failed'));
    }
  }

  function call(method, args) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID?.() || String(Date.now()) + Math.random();
      pending.set(id, { resolve, reject });
      window.parent.postMessage(
        { channel: CHANNEL, event: 'apphub:bridge:call', id, method, args: args || [] },
        '*'
      );
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('Bridge call timed out'));
        }
      }, 30000);
    });
  }

  const bridge = {
    getContext() {
      return context;
    },
    getDisplayUser() {
      return context?.display_user ?? null;
    },
    requestPermission(scope) {
      return call('requestPermission', [scope]);
    },
    sendDesktopMessage(payload) {
      return call('sendDesktopMessage', [payload]);
    },
    setTaskbarBadge(count) {
      return call('setTaskbarBadge', [count]);
    },
    saveFile(payload) {
      return call('saveFile', [payload]);
    },
    reportError(error) {
      const payload =
        typeof error === 'string'
          ? { message: error }
          : error instanceof Error
            ? { message: error.message, name: error.name, stack: error.stack }
            : error;
      return call('reportError', [payload]);
    },
  };

  window.addEventListener('message', handleMessage);
  window.AppHubBridge = bridge;
})();
