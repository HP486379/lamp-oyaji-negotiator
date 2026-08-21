const currentUserId = "local-user";

const clone = (value) => JSON.parse(JSON.stringify(value));
const makeId = (prefix, next) => `${prefix}-${next}`;
const localDateTime = (date, time) => `${date}T${time}`;
const overlaps = (startA, endA, startB, endB) => startA < endB && startB < endA;

export class ParkingStore {
  #spots = [];
  #slots = [];
  #reservations = [];
  #sequence = 1;

  snapshot() {
    return clone({ currentUserId, spots: this.#spots, slots: this.#slots, reservations: this.#reservations });
  }

  createSpot({ city, name = "" }) {
    if (!String(city ?? "").trim()) throw new ParkingError(400, "市区町村は必須です。");
    const spot = { id: makeId("spot", this.#sequence++), owner_user_id: currentUserId, city: city.trim(), name: name.trim() };
    this.#spots.push(spot);
    return clone(spot);
  }

  createSlot({ parkingSpotId, date, startTime, endTime }) {
    const spot = this.#spots.find((item) => item.id === parkingSpotId && item.owner_user_id === currentUserId);
    if (!spot) throw new ParkingError(404, "駐車場が見つかりません。");
    if (!date || !startTime || !endTime || startTime >= endTime) throw new ParkingError(400, "開始時刻は終了時刻より前である必要があります。");
    const slot = { id: makeId("slot", this.#sequence++), parking_spot_id: spot.id, date, start_time: startTime, end_time: endTime };
    this.#slots.push(slot);
    return clone(slot);
  }

  search(city) {
    const normalizedCity = String(city ?? "").trim();
    if (!normalizedCity) throw new ParkingError(400, "市区町村は必須です。");
    return this.#slots.flatMap((slot) => {
      const spot = this.#spots.find((item) => item.id === slot.parking_spot_id);
      if (!spot || spot.city !== normalizedCity || this.#hasOverlap(slot.parking_spot_id, slot.date, slot.start_time, slot.end_time)) return [];
      return [{ ...clone(slot), parkingSpot: clone(spot) }];
    });
  }

  reserve({ parkingSpotId, date, startTime, endTime, selfReservationConfirmed = false }) {
    const spot = this.#spots.find((item) => item.id === parkingSpotId);
    if (!spot) throw new ParkingError(404, "駐車場が見つかりません。");
    const slot = this.#slots.find((item) => item.parking_spot_id === parkingSpotId && item.date === date && item.start_time === startTime && item.end_time === endTime);
    if (!slot) throw new ParkingError(404, "選択した空き枠が見つかりません。");
    if (spot.owner_user_id === currentUserId && !selfReservationConfirmed) throw new ParkingError(409, "この枠はあなたの公開枠です。確認してから予約してください。", "SELF_RESERVATION_CONFIRMATION_REQUIRED");
    if (this.#hasOverlap(parkingSpotId, date, startTime, endTime)) throw new ParkingError(409, "選択した時間は既に予約されています。", "OVERLAPPING_RESERVATION");
    const reservation = {
      id: makeId("reservation", this.#sequence++), parking_spot_id: parkingSpotId, user_id: currentUserId,
      start_datetime: localDateTime(date, startTime), end_datetime: localDateTime(date, endTime), created_at: new Date().toISOString(),
    };
    this.#reservations.push(reservation);
    return clone(reservation);
  }

  assertOwnerUseAllowed({ parkingSpotId, date, startTime, endTime }) {
    const spot = this.#spots.find((item) => item.id === parkingSpotId && item.owner_user_id === currentUserId);
    if (!spot) throw new ParkingError(404, "駐車場が見つかりません。");
    if (this.#hasOverlap(parkingSpotId, date, startTime, endTime)) throw new ParkingError(409, "予約成立後の時間帯には自己利用を申請できません。", "OWNER_USE_BLOCKED_BY_RESERVATION");
    return true;
  }

  #hasOverlap(parkingSpotId, date, startTime, endTime) {
    const start = localDateTime(date, startTime);
    const end = localDateTime(date, endTime);
    return this.#reservations.some((reservation) => reservation.parking_spot_id === parkingSpotId && overlaps(start, end, reservation.start_datetime, reservation.end_datetime));
  }
}

export class ParkingError extends Error {
  constructor(status, message, code = "PARKING_VALIDATION_ERROR") {
    super(message); this.status = status; this.code = code;
  }
}
