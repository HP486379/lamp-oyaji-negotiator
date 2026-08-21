import { useEffect, useMemo, useState } from "react";

const emptyState = { currentUserId: "local-user", spots: [], slots: [], reservations: [] };
const parkingSpecPreview = `# 駐車場時間貸し MVP

## Project Overview
自宅駐車場の未使用時間を、限定した市区町村内で短時間貸し出す。

## Core User Value
貸し手は空き時間を公開し、借り手は即時確定で予約して利用できる。

## User Confirmed Decisions
- 単一アカウントが貸し手／借り手を兼ねる
- 予約は即時確定
- 限定した市区町村から開始
- 予約成立後は予約優先で、貸し手は自己利用申請できない

## AI-Inferred Requirements
- 市区町村単位の駐車場登録と検索
- 日付・開始時刻・終了時刻による利用可能枠
- 即時予約と重複予約のブロック
- 自分の公開枠を予約する際の明示・確認

## MVP Scope
駐車場登録、利用可能枠作成、市区町村検索、即時予約、マイ予約／マイリスティング。

## Future / Optional
- 入退場手順の任意入力
- 地図検索

## Functional Requirements
FR1 市区町村必須の駐車場登録。
FR2 同日内で開始時刻 < 終了時刻となる利用可能枠作成。
FR3 同一市区町村の空き枠検索。
FR4 空き枠の即時予約確定。
FR5 予約時間帯の占有・重複予約ブロック。
FR6 予約成立後の自己利用申請禁止。
FR7 自分の公開枠を予約する際の確認。

## Data Model
ParkingSpot { id, owner_user_id, city }
AvailabilitySlot { id, parking_spot_id, date, start_time, end_time }
Reservation { id, parking_spot_id, user_id, start_datetime, end_datetime, created_at }

## Acceptance Criteria
AC1 市区町村を指定して登録できる。
AC2 不正な時刻範囲を拒否する。
AC3 即時予約後、同時間帯は予約不可。
AC4 重複予約を拒否する。
AC5 自己公開枠は確認してから予約する。
AC6 予約済み時間への自己利用申請を防止する。`;
const request = async (url, options = {}) => {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "操作に失敗しました。");
  return payload;
};
const timeRange = (slot) => `${slot.date} ${slot.start_time}–${slot.end_time}`;

export default function App() {
  const [data, setData] = useState(emptyState);
  const [view, setView] = useState("spot");
  const [spotForm, setSpotForm] = useState({ city: "", name: "" });
  const [slotForm, setSlotForm] = useState({ parkingSpotId: "", date: "", startTime: "", endTime: "" });
  const [city, setCity] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ownSpots = useMemo(() => data.spots.filter((spot) => spot.owner_user_id === data.currentUserId), [data]);
  const selectedSpotId = slotForm.parkingSpotId || ownSpots[0]?.id || "";

  const load = async () => {
    const state = await request("/api/parking/state");
    setData(state);
    setSlotForm((form) => form.parkingSpotId || !state.spots[0] ? form : { ...form, parkingSpotId: state.spots[0].id });
  };
  useEffect(() => {
    let cancelled = false;
    request("/api/parking/state").then((state) => {
      if (cancelled) return;
      setData(state);
      setSlotForm((form) => form.parkingSpotId || !state.spots[0] ? form : { ...form, parkingSpotId: state.spots[0].id });
    }).catch((loadError) => { if (!cancelled) setError(loadError.message); });
    return () => { cancelled = true; };
  }, []);
  const run = async (operation) => {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); }
    catch (operationError) { setError(operationError.message); }
    finally { setBusy(false); }
  };
  const navigate = (nextView) => { setView(nextView); setError(""); setMessage(""); };

  const createSpot = () => run(async () => {
    await request("/api/parking/spots", { method: "POST", body: JSON.stringify(spotForm) });
    setSpotForm({ city: "", name: "" }); await load(); setMessage("駐車場を登録しました。");
  });
  const createSlot = () => run(async () => {
    await request("/api/parking/slots", { method: "POST", body: JSON.stringify({ ...slotForm, parkingSpotId: selectedSpotId }) });
    setSlotForm((form) => ({ ...form, date: "", startTime: "", endTime: "" })); await load(); setMessage("利用可能枠を作成しました。");
  });
  const search = () => run(async () => {
    const slots = await request(`/api/parking/search?city=${encodeURIComponent(city)}`);
    setResults(slots); setMessage(`${slots.length}件の空き枠があります。`);
  });
  const reserve = () => run(async () => {
    await request("/api/parking/reservations", { method: "POST", body: JSON.stringify({
      parkingSpotId: selected.parking_spot_id, date: selected.date, startTime: selected.start_time, endTime: selected.end_time, selfReservationConfirmed: true,
    }) });
    await load(); setSelected(null); setResults([]); setView("my"); setMessage("予約を即時確定しました。");
  });

  return <main className="parking-app"><div className="app-layout"><section className="app-content">
    <header className="app-header"><div><p className="eyebrow">限定した市区町村から始める</p><h1>駐車場時間貸し</h1><p className="subtitle">空き時間を登録し、即時確定で予約する</p></div></header>
    <nav aria-label="画面選択">{[
      ["spot", "駐車場登録"], ["slot", "利用可能枠"], ["search", "検索"], ["reserve", "予約"], ["my", "マイ予約／マイリスティング"],
    ].map(([id, label]) => <button key={id} className={view === id ? "tab active" : "tab"} onClick={() => navigate(id)}>{label}</button>)}</nav>
    {error && <aside className="notice error" role="alert">{error}</aside>}
    {message && <aside className="notice success">{message}</aside>}

    {view === "spot" && <section className="card"><h2>駐車場登録</h2><p>市区町村を指定して、公開する駐車場を登録します。</p><label>市区町村<input required value={spotForm.city} onChange={(event) => { const value = event.target.value; setSpotForm((form) => ({ ...form, city: value })); }} /></label><label>駐車場名称（任意）<input value={spotForm.name} onChange={(event) => { const value = event.target.value; setSpotForm((form) => ({ ...form, name: value })); }} /></label><button disabled={busy || !spotForm.city.trim()} onClick={createSpot}>登録する</button></section>}

    {view === "slot" && <section className="card"><h2>利用可能枠作成</h2><p>同日内の開始時刻と終了時刻を指定します。</p>{ownSpots.length === 0 ? <p className="muted">先に駐車場を登録してください。</p> : <><label>駐車場<select value={selectedSpotId} onChange={(event) => { const value = event.target.value; setSlotForm((form) => ({ ...form, parkingSpotId: value })); }}>{ownSpots.map((spot) => <option key={spot.id} value={spot.id}>{spot.city}{spot.name ? ` — ${spot.name}` : ""}</option>)}</select></label><div className="two-columns"><label>日付<input type="date" value={slotForm.date} onChange={(event) => { const value = event.target.value; setSlotForm((form) => ({ ...form, date: value })); }} /></label><label>開始時刻<input type="time" value={slotForm.startTime} onChange={(event) => { const value = event.target.value; setSlotForm((form) => ({ ...form, startTime: value })); }} /></label><label>終了時刻<input type="time" value={slotForm.endTime} onChange={(event) => { const value = event.target.value; setSlotForm((form) => ({ ...form, endTime: value })); }} /></label></div><button disabled={busy || !selectedSpotId || !slotForm.date || !slotForm.startTime || !slotForm.endTime} onClick={createSlot}>利用可能枠を作成</button></>}</section>}

    {view === "search" && <section className="card"><h2>空き駐車場を検索</h2><p>市区町村が一致する空き時間だけを表示します。</p><div className="search-row"><label>市区町村<input value={city} onChange={(event) => setCity(event.target.value)} /></label><button disabled={busy || !city.trim()} onClick={search}>検索</button></div>{results.length > 0 && <ul className="slot-list">{results.map((slot) => <li key={slot.id}><div><b>{slot.parkingSpot.city}{slot.parkingSpot.name ? ` — ${slot.parkingSpot.name}` : ""}</b><span>{timeRange(slot)}</span></div><button disabled={busy} onClick={() => { setSelected(slot); setView("reserve"); setMessage(""); }}>この枠を予約</button></li>)}</ul>}</section>}

    {view === "reserve" && <section className="card"><h2>予約</h2>{selected ? <><p className="reservation-summary"><b>{selected.parkingSpot.city}{selected.parkingSpot.name ? ` — ${selected.parkingSpot.name}` : ""}</b><span>{timeRange(selected)}</span></p>{selected.parkingSpot.owner_user_id === data.currentUserId && <aside className="self-warning">この枠はあなたの公開枠です。予約を確定すると、同じ時間帯は他から予約できなくなります。</aside>}<div className="actions"><button disabled={busy} onClick={reserve}>確認して即時確定</button><button className="secondary" disabled={busy} onClick={() => { setSelected(null); setView("search"); }}>キャンセル</button></div></> : <p className="muted">検索画面で空き時間を選択してください。</p>}</section>}

    {view === "my" && <section className="card"><h2>マイ予約／マイリスティング</h2><div className="listing-grid"><section><h3>マイリスティング</h3>{ownSpots.length ? <ul>{ownSpots.map((spot) => <li key={spot.id}><b>{spot.city}{spot.name ? ` — ${spot.name}` : ""}</b><ul>{data.slots.filter((slot) => slot.parking_spot_id === spot.id).map((slot) => <li key={slot.id}>{timeRange(slot)}</li>)}</ul></li>)}</ul> : <p className="muted">登録済みの駐車場はありません。</p>}</section><section><h3>マイ予約</h3>{data.reservations.length ? <ul>{data.reservations.map((reservation) => <li key={reservation.id}>{reservation.start_datetime.replace("T", " ")}–{reservation.end_datetime.slice(11)}</li>)}</ul> : <p className="muted">予約はありません。</p>}</section></div><p className="policy">予約成立後の時間帯は予約優先です。貸し手はその時間帯に自己利用を申請できません。</p></section>}
    </section><aside className="spec-sidebar"><p className="eyebrow">読み取り専用</p><h2>駐車場SPEC</h2><pre>{parkingSpecPreview}</pre></aside></div>
  </main>;
}
