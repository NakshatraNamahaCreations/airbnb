export function findMatchInfo(obj, path = "") {

    console.log("obj",obj, path)
  try {
    if (!obj || typeof obj !== "object") return [];
    const out = [];

    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;

      if (typeof v === "boolean" && /match|matched|face/i.test(k)) {
        out.push({ key: p, value: v });
      }

      if (typeof v === "number" && /score|similar|confidence|threshold/i.test(k)) {
        out.push({ key: p, value: v });
      }

      if (v && typeof v === "object") out.push(...findMatchInfo(v, p));
    }

    return out;
  } catch (err) {
    console.error("findMatchInfo error:", err);
    return [];
  }
}
    