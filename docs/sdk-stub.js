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
    /**
     * Parent production suite RPC — action must be listed in manifest parent_bridge.actions.
     * Requires matching parent.* scope on launch token and DEV-approved app version.
     * @param {string} action e.g. 'project.list'
     * @param {object} [args]
     * @param {{ timeoutMs?: number }} [options]
     */
    callParent(action, args, options) {
      return call('callParent', [action, args, options]);
    },
    /**
     * Fire-and-forget event to parent host — event must be in manifest parent_bridge.events.
     * @param {string} event e.g. 'bonus.assign'
     * @param {object} [payload]
     */
    emitToParent(event, payload) {
      return call('emitToParent', [event, payload]);
    },
    /** Optional wrapper — scope parent.project.list */
    listProjects(query) {
      return this.callParent('project.list', { query: query || {} });
    },
    /** Optional wrapper — scope parent.project.members */
    listProjectMembers(projectCode) {
      return this.callParent('project.members', { projectCode });
    },
    /** Optional wrapper — scope parent.signature.user (or action name from host config) */
    getUserSignature(opts) {
      return this.callParent('signature.user', opts || {});
    },
  };

  window.addEventListener('message', handleMessage);
  window.AppHubBridge = bridge;
})();
