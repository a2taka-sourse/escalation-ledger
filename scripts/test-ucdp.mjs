// Offline checks for the UCDP context (src/model/ucdp_context.json built by scripts/build_ucdp.py).
import { ucdpContext } from "../src/ucdp.mjs";
let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) fail++; };

const ru = ucdpContext("Russia", "Ukraine");
ok(ru.matched && ru.interstate_history.war_years >= 4 && ru.interstate_history.first_year === 2022, "Russia-Ukraine: war years from 2022");
ok(ucdpContext("Ukraine", "Russia").interstate_history.conflict_years === ru.interstate_history.conflict_years, "pair order does not matter");
ok(ru.this_year.between_the_two_governments.events > 0, "Russia-Ukraine: candidate events between the governments this year");
ok(ucdpContext("India", "Pakistan").interstate_history.first_year === 1948, "India-Pakistan history starts 1948");
const none = ucdpContext("Brazil", "Japan");
ok(none.matched && none.interstate_history.conflict_years === 0, "no recorded conflict -> zero years, not an error");
ok(ucdpContext("Serbia", "Croatia").matched, "Serbia resolves (COW 345 -> GW 340/345)");
ok(ucdpContext("Narnia", "France").matched === false, "unknown name -> matched=false, no throw");
console.log(fail ? `${fail} failed` : "all ok");
process.exit(fail ? 1 : 0);
