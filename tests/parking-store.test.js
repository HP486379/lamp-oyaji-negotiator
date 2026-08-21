import test from "node:test";
import assert from "node:assert/strict";
import { ParkingStore } from "../server/parking-store.js";

const addAvailableSpot = () => {
  const store = new ParkingStore();
  const spot = store.createSpot({ city: "渋谷区", name: "自宅前" });
  const slot = store.createSlot({ parkingSpotId: spot.id, date: "2026-08-20", startTime: "10:00", endTime: "11:00" });
  return { store, spot, slot };
};

test("AC1: owner can register a parking spot with a required city", () => {
  const store = new ParkingStore();
  const spot = store.createSpot({ city: "渋谷区", name: "自宅前" });
  assert.equal(spot.city, "渋谷区");
  assert.throws(() => store.createSpot({ city: "" }), /市区町村は必須/);
});

test("AC2: an availability slot requires start time before end time", () => {
  const { store, spot } = addAvailableSpot();
  assert.throws(() => store.createSlot({ parkingSpotId: spot.id, date: "2026-08-20", startTime: "11:00", endTime: "10:00" }), /開始時刻は終了時刻より前/);
});

test("AC3 and AC4: same-city search exposes an empty slot, then immediate reservation blocks overlaps", () => {
  const { store, spot, slot } = addAvailableSpot();
  assert.equal(store.search("渋谷区").length, 1);
  assert.throws(() => store.reserve({ parkingSpotId: spot.id, date: slot.date, startTime: slot.start_time, endTime: slot.end_time }), /確認してから予約/);
  const reservation = store.reserve({ parkingSpotId: spot.id, date: slot.date, startTime: slot.start_time, endTime: slot.end_time, selfReservationConfirmed: true });
  assert.equal(reservation.parking_spot_id, spot.id);
  assert.equal(store.search("渋谷区").length, 0);
  assert.throws(() => store.reserve({ parkingSpotId: spot.id, date: slot.date, startTime: slot.start_time, endTime: slot.end_time, selfReservationConfirmed: true }), /既に予約/);
});

test("AC5: self reservation requires an explicit confirmation", () => {
  const { store, spot, slot } = addAvailableSpot();
  assert.throws(() => store.reserve({ parkingSpotId: spot.id, date: slot.date, startTime: slot.start_time, endTime: slot.end_time }), /あなたの公開枠/);
  assert.equal(store.snapshot().reservations.length, 0);
});

test("AC6: an accepted reservation prevents the owner from using that time", () => {
  const { store, spot, slot } = addAvailableSpot();
  store.reserve({ parkingSpotId: spot.id, date: slot.date, startTime: slot.start_time, endTime: slot.end_time, selfReservationConfirmed: true });
  assert.throws(() => store.assertOwnerUseAllowed({ parkingSpotId: spot.id, date: slot.date, startTime: slot.start_time, endTime: slot.end_time }), /自己利用を申請できません/);
});
