const map = new Map(); 
// state -> { transactionId, createdAt, initiateResponse, exportResponse, matchInfo }

export function saveStateTxn(state, data) {
  try {
    map.set(state, { ...data, createdAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.error("saveStateTxn error:", e);
    return false;
  }
}

export function getStateTxn(state) {
  try {
    return map.get(state) || null;
  } catch (e) {
    console.error("getStateTxn error:", e);
    return null;
  }
}

export function updateStateTxn(state, patch) {
  try {
    const prev = map.get(state);
    if (!prev) return false;
    map.set(state, { ...prev, ...patch });
    return true;
  } catch (e) {
    console.error("updateStateTxn error:", e);
    return false;
  }
}
