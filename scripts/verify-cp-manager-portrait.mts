import { INTRO } from "@/lib/commercialProposal/layout";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const slot = INTRO.photoSlot;
assert(Number.isFinite(slot.cx) && Number.isFinite(slot.yTop) && Number.isFinite(slot.r), "photoSlot coords");
assert(slot.r > 20 && slot.r < 60, `photoSlot.r out of range: ${slot.r}`);
assert(INTRO.photo.w > 0 && INTRO.photo.h > 0, "INTRO.photo box required to cover design artwork");

console.log("verify-cp-manager-portrait: ok", {
  photoSlot: slot,
  photoBox: INTRO.photo,
});
