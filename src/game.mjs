// Port of solve_game() from ngcm_war_game.py (下腦 war judgment v0.2/v04, frozen 2026-09-24).
// Fearon (1995) bargaining game, solved backwards with agent logit QRE (McKelvey & Palfrey 1995),
// Tullock contest success, Boulding loss-of-strength gradient, Bueno de Mesquita private gains.
// Constants are copied verbatim; lambda/Lambda come from the frozen v04 fit.

export const C = {
  MOBIL: { e1: 0.015, e2: 0.015, e3: 0.015, e4: 0.03, e5: 0.05 },
  MOBIL_REBEL: 1.5, MOBIL_TRIBE: 0.03,
  LAMBDA_ERA: { e1: 1.0, e2: 1.0, e3: 1.0, e4: 1.5, e5: 2.0 },
  SOLDIER_COST: 15.0, WAR_YEARS: 2.0, HORIZON: 10.0, COLONIZE: 0.1,
  AUDIENCE: 0.2, BELIEF: 0.3, PATIENCE: 0.3, DEF_ROUGH: 0.6, DEF_WET: 1.0,
};
// frozen v04 (frozen.json, 2026-09-24T11:55:28): lambda = exp(th[-2]), Lambda = exp(th[-1])
export const FROZEN = { lam: 7.714759843968283, Lam: 1157.2073744669713, frozen_at: "2026-09-24T11:55:28", code_fp: "fb93b5828a765d0c" };

export const NEUTRAL = { coh: 1, wA: 1, wD: 1, ia: 0.5, cp: 0.5, ind: 0.5, priv: 1, risk: 1, q: 1, generic: 0.5 };

const logit = (u, lam) => {
  const v = u.map(x => x * lam), m = Math.max(...v), e = v.map(x => Math.exp(x - m)), s = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / s);
};

/** Jev scores (0-4) -> game quantities. Same mapping as jev_values(). */
export function jevToGame(s, generic = 0.5, cohScore = null) {
  return {
    coh: cohScore == null ? 1 : 2 ** ((cohScore - 2) / 2),
    wA: 2 ** ((s.J1 - 2) / 2), wD: 2 ** ((s.J2 - 2) / 2),
    ia: s.J3 / 4, cp: s.J4 / 4, ind: s.J5 / 4,
    priv: s.J6 / 2, risk: s.J7 / 2, q: 2 ** ((s.J8 - 2) / 2),
    generic,
  };
}

/**
 * w: { era, kind: "war"|"rebellion", popA, popD, popT, distA_km, distD_km, roughT, wetT }
 * jv: game quantities (jevToGame or NEUTRAL)
 */
export function solveGame(w, jv, { lam = FROZEN.lam, Lam = FROZEN.Lam } = {}) {
  const { MOBIL, LAMBDA_ERA } = C;
  const m = MOBIL[w.era];
  const Le = Lam * LAMBDA_ERA[w.era];
  const dfn = 1 + C.DEF_ROUGH * (w.roughT || 0) + C.DEF_WET * (w.wetT || 0);
  const cs = C.SOLDIER_COST, H = C.HORIZON;
  let SA, SD, VA, VD, CA, CD;
  if (w.kind === "rebellion") {
    const mA = m * C.MOBIL_REBEL;
    SA = mA * w.popT * jv.q * dfn;
    SD = m * w.popD * Math.exp(-w.distD_km / Le) * jv.coh;
    VA = H * jv.wA;
    VD = w.popT / Math.max(w.popD, 1) * H * jv.wD;
    CA = mA * cs * C.WAR_YEARS;
    CD = m * cs * C.WAR_YEARS * (1 + w.distD_km / Le);
  } else {
    SA = m * w.popA * jv.q * Math.exp(-w.distA_km / Le);
    SD = m * w.popD * Math.exp(-w.distD_km / Le) * dfn * jv.coh;
    VA = w.popT / Math.max(w.popA, 1) * H * jv.wA;
    VD = w.popT / Math.max(w.popD, 1) * H * jv.wD;
    CA = m * cs * C.WAR_YEARS * (1 + w.distA_km / Le);
    CD = m * cs * C.WAR_YEARS * (1 + w.distD_km / Le);
  }
  const p = SA / Math.max(SA + SD, 1e-12);
  const pA = Math.min(Math.max(p + C.BELIEF * jv.ia, 0.01), 0.99);
  const pD = Math.min(Math.max(p - C.BELIEF * jv.ia, 0.01), 0.99);
  const L = jv.risk, G = jv.priv * VA, aud = C.AUDIENCE;
  const euWarA = pp => pp * pp * VA - CA - (1 - pp) ** 2 * L + G;
  const sA = VA + CA + L + G + 1e-9, sD = VD + CD + 1e-9;
  const P3 = logit([euWarA(pA) / sA, -aud / sA], lam)[0];
  const out = [0, 0, 0];
  for (const [xfull, wgt] of [[true, jv.ind], [false, 1 - jv.ind]]) {
    const x = xfull ? 1 : Math.min(1, pA + CD / Math.max(VD, 1e-9));
    const P2 = logit([(-x * VD) / sD, (P3 * (-(pD * pD) * VD - CD)) / sD], lam);
    const uSq = -jv.cp * C.PATIENCE * VA;
    const uDemand = P2[0] * x * VA + P2[1] * (P3 * euWarA(pA) + (1 - P3) * (-aud));
    const P1 = logit([uSq / sA, uDemand / sA, euWarA(pA) / sA], lam);
    out[0] += wgt * (P1[2] + P1[1] * P2[1] * P3);
    out[1] += wgt * (P1[1] * P2[0] * x);
    out[2] += wgt * (P1[0] + P1[1] * P2[1] * (1 - P3));
  }
  const war = out[0];
  return {
    p_win_A: p, war, concession: out[1], status_quo: out[2],
    war_outcomes: { A_wins: war * p * p, stalemate: war * 2 * p * (1 - p), A_loses: war * (1 - p) ** 2 },
    internals: { SA, SD, VA, VD, CA, CD, defense_mult: dfn },
  };
}
