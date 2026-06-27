import { useState, useEffect, useRef } from "react";

const CATS = [
  { key:"식비",     label:"식비·외식",   pct:15, color:"#F97316", emoji:"🍚" },
  { key:"주거",     label:"주거·공과금", pct:25, color:"#3B82F6", emoji:"🏠" },
  { key:"교통",     label:"교통",        pct:8,  color:"#8B5CF6", emoji:"🚇" },
  { key:"보험",     label:"보험",        pct:5,  color:"#EC4899", emoji:"🛡" },
  { key:"의료",     label:"의료·건강",   pct:3,  color:"#10B981", emoji:"🏥" },
  { key:"문화여가", label:"문화·여가",   pct:5,  color:"#F59E0B", emoji:"🎬" },
  { key:"의류",     label:"의류·쇼핑",   pct:4,  color:"#6366F1", emoji:"👗" },
  { key:"교육",     label:"교육",        pct:5,  color:"#14B8A6", emoji:"📚" },
  { key:"기타",     label:"기타",        pct:5,  color:"#94A3B8", emoji:"📦" },
  { key:"저축",     label:"저축",        pct:15, color:"#22C55E", emoji:"🏦" },
  { key:"투자",     label:"투자",        pct:10, color:"#EAB308", emoji:"📈" },
];
const MEMBER_COLORS = ["#818CF8","#34D399","#FB923C","#F472B6","#60A5FA","#A78BFA"];
const STORAGE_KEY = "kyungja_v2";
const ROOM_KEY    = "kyungja_room_v2";
const NAME_KEY    = "kyungja_name_v2";

const fmt = function(n){ return (n||0).toLocaleString("ko-KR")+"원"; };
const getMonthKey   = function(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
const getMonthLabel = function(k){ var p=k.split("-"); return p[0]+"년 "+parseInt(p[1])+"월"; };
const genCode = function(){ return Math.random().toString(36).substring(2,8).toUpperCase(); };

async function aiClassify(text, type) {
  var sys = [
    "당신은 가계부 AI입니다. 사용자 입력에서 아래를 추출하세요.",
    "- type: "+type+" (고정값, 변경 금지)",
    "- category: "+( type==="수입" ? "월급,알바,용돈,부업,기타수입" : "식비,주거,교통,보험,의료,문화여가,의류,교육,기타,저축,투자")+" 중 하나",
    "- amount: 숫자만. 만→x10000, 천→x1000, 백→x100",
    "- description: 10자 이내 핵심 설명",
    "JSON만 반환. 예:{\"type\":\""+type+"\",\"category\":\"식비\",\"amount\":8000,\"description\":\"김치찌개\"}"
  ].join("\n");
  var res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,system:sys,messages:[{role:"user",content:text}]})
  });
  var data = await res.json();
  var raw = data.content.map(function(b){return b.text||"";}).join("").replace(/```json|```/g,"").trim();
  return JSON.parse(raw);
}

async function sharedGet(code) {
  try { var r = await window.storage.get("kyungja_"+code, true); return r ? JSON.parse(r.value) : null; }
  catch(e){ return null; }
}
async function sharedSet(code, value) {
  try { await window.storage.set("kyungja_"+code, JSON.stringify(value), true); return true; }
  catch(e){ return false; }
}


const getPrevMonthKey = function(k){
  var p=k.split("-").map(Number);
  return p[1]===1 ? (p[0]-1)+"-12" : p[0]+"-"+String(p[1]-1).padStart(2,"0");
};
const SEEN_KEY = "kyungja_seen_v2";

function buildReport(records, monthKey) {
  var recs = records.filter(function(r){ return r.monthKey===monthKey; });
  var income  = recs.filter(function(r){ return r.type==="수입"; }).reduce(function(s,r){ return s+r.amount; },0);
  var expense = recs.filter(function(r){ return r.type==="지출"; }).reduce(function(s,r){ return s+r.amount; },0);
  var balance = income - expense;
  var savingRate = income>0 ? Math.round((balance/income)*100) : 0;
  var byCategory = {};
  recs.filter(function(r){ return r.type==="지출"; }).forEach(function(r){
    byCategory[r.category]=(byCategory[r.category]||0)+r.amount;
  });
  return { monthKey, income, expense, balance, savingRate, byCategory, count:recs.length };
}

function MonthReport(props) {
  var report   = props.report;
  var onClose  = props.onClose;
  var isPopup  = props.isPopup;
  if (!report) return null;

  var income     = report.income;
  var expense    = report.expense;
  var balance    = report.balance;
  var savingRate = report.savingRate;
  var byCategory = report.byCategory;
  var monthKey   = report.monthKey;

  var scored = CATS.filter(function(c){ return c.key!=="저축"&&c.key!=="투자"; }).map(function(cat){
    var spent = byCategory[cat.key]||0;
    var rec   = Math.round(income*cat.pct/100);
    var pct   = income>0 ? Math.round((spent/income)*100) : 0;
    var over  = pct>cat.pct;
    return Object.assign({},cat,{spent,rec,pct,over});
  }).filter(function(c){ return c.spent>0||c.key==="식비"||c.key==="주거"; });

  var goods  = scored.filter(function(c){ return !c.over&&c.spent>0; });
  var overs  = scored.filter(function(c){ return c.over; });
  var health = Math.max(0, 100 - overs.length*12 - (savingRate<15?20:0) - (savingRate<0?20:0));

  var outerStyle = isPopup ? {
    position:"fixed", top:0, left:0, right:0, bottom:0,
    background:"rgba(0,0,0,0.8)", display:"flex",
    alignItems:"flex-end", justifyContent:"center", zIndex:9000,
  } : {};

  return (
    <div style={outerStyle}>
      <div style={{
        background:"#0A0F1E", width:"100%", maxWidth:480,
        borderRadius:isPopup?"22px 22px 0 0":"0",
        maxHeight:isPopup?"92vh":"auto", overflowY:"auto",
        border:"1px solid #1E293B",
      }}>
        {/* 헤더 */}
        <div style={{background:"linear-gradient(135deg,#1E1B4B,#4C1D95)",padding:"26px 24px 22px",borderRadius:isPopup?"22px 22px 0 0":"0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
            <div>
              <div style={{fontSize:11,color:"#A5B4FC",letterSpacing:2,marginBottom:5}}>MONTHLY REPORT</div>
              <div style={{fontSize:22,fontWeight:900}}>{getMonthLabel(monthKey)+" 결산"}</div>
            </div>
            {onClose&&<button onClick={onClose} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#A5B4FC",borderRadius:99,width:34,height:34,cursor:"pointer",fontSize:20,lineHeight:"34px",textAlign:"center"}}>x</button>}
          </div>
          {/* 점수 */}
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1,background:"rgba(255,255,255,0.1)",borderRadius:14,padding:"12px 16px"}}>
              <div style={{fontSize:11,color:"#A5B4FC",marginBottom:3}}>재무 건강 점수</div>
              <div style={{fontSize:30,fontWeight:900,color:health>=80?"#86EFAC":health>=60?"#FDE68A":"#FCA5A5"}}>
                {health}<span style={{fontSize:13,fontWeight:400,color:"#A5B4FC"}}>/100</span>
              </div>
            </div>
            <div style={{flex:1,background:"rgba(255,255,255,0.1)",borderRadius:14,padding:"12px 16px"}}>
              <div style={{fontSize:11,color:"#A5B4FC",marginBottom:3}}>저축률</div>
              <div style={{fontSize:30,fontWeight:900,color:savingRate>=15?"#86EFAC":savingRate>=0?"#FDE68A":"#FCA5A5"}}>
                {savingRate}<span style={{fontSize:13,fontWeight:400,color:"#A5B4FC"}}>%</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{padding:"22px 24px 36px"}}>
          {/* 수입/지출/잔액 */}
          <div style={{display:"flex",gap:8,marginBottom:22}}>
            {[["총 수입",income,"#22C55E"],["총 지출",expense,"#F87171"],["잔액",balance,balance>=0?"#818CF8":"#EF4444"]].map(function(x){
              return <div key={x[0]} style={{flex:1,background:"#1E293B",borderRadius:14,padding:"13px 10px",textAlign:"center"}}>
                <div style={{fontSize:11,color:"#64748B",marginBottom:4}}>{x[0]}</div>
                <div style={{fontSize:14,fontWeight:800,color:x[2]}}>{fmt(x[1])}</div>
              </div>;
            })}
          </div>

          {/* 카테고리별 지출 */}
          <div style={{fontSize:14,fontWeight:700,color:"#94A3B8",marginBottom:10}}>카테고리별 지출</div>
          <div style={{background:"#1E293B",borderRadius:16,overflow:"hidden",marginBottom:20}}>
            {scored.filter(function(c){ return c.spent>0; }).length===0 ? (
              <div style={{padding:"20px",textAlign:"center",color:"#475569",fontSize:13}}>지출 기록이 없어요</div>
            ) : scored.filter(function(c){ return c.spent>0; }).map(function(cat,i,arr){
              return (
                <div key={cat.key} style={{padding:"13px 18px",borderBottom:i<arr.length-1?"1px solid #0A0F1E":"none",display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:22,width:30,flexShrink:0}}>{cat.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <span style={{fontSize:14,fontWeight:700}}>{cat.label}</span>
                      <span style={{fontSize:14,fontWeight:800,color:cat.over?"#F87171":cat.color}}>{fmt(cat.spent)}</span>
                    </div>
                    <div style={{background:"#0A0F1E",borderRadius:99,height:5}}>
                      <div style={{width:Math.min(100,income>0?Math.round((cat.spent/cat.rec)*100):0)+"%",height:"100%",background:cat.over?"#EF4444":cat.color,borderRadius:99}} />
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#64748B",marginTop:3}}>
                      <span>{"권장 "+fmt(cat.rec)+" ("+cat.pct+"%)"}</span>
                      <span style={{color:cat.over?"#FCA5A5":"#86EFAC"}}>{cat.over?"▲ "+fmt(cat.spent-cat.rec)+" 초과":"적정"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 잘한 점 */}
          {goods.length>0&&(
            <div style={{background:"#052E16",border:"1px solid #166534",borderRadius:14,padding:"14px 18px",marginBottom:12}}>
              <div style={{fontSize:13,color:"#86EFAC",fontWeight:700,marginBottom:8}}>잘한 점</div>
              {goods.map(function(c){ return <div key={c.key} style={{fontSize:13,color:"#D1FAE5",marginBottom:4}}>{c.emoji+" "+c.label+": "+fmt(c.spent)+" — 권장 이내"}</div>; })}
              {savingRate>=15&&<div style={{fontSize:13,color:"#D1FAE5"}}>{"저축률 "+savingRate+"% 달성!"}</div>}
            </div>
          )}

          {/* 개선할 점 */}
          {(overs.length>0||savingRate<15)&&(
            <div style={{background:"#450A0A",border:"1px solid #991B1B",borderRadius:14,padding:"14px 18px",marginBottom:20}}>
              <div style={{fontSize:13,color:"#FCA5A5",fontWeight:700,marginBottom:8}}>다음 달 개선할 점</div>
              {overs.map(function(c){ return <div key={c.key} style={{fontSize:13,color:"#FEE2E2",marginBottom:4}}>{c.emoji+" "+c.label+": "+fmt(c.spent-c.rec)+" 초과 — 목표 "+fmt(c.rec)+" 이내"}</div>; })}
              {savingRate<15&&<div style={{fontSize:13,color:"#FEE2E2"}}>{"저축률 "+savingRate+"% — 목표 15% ("+fmt(Math.max(0,Math.round(income*0.15)-balance))+" 부족)"}</div>}
            </div>
          )}

          {/* 다음 달 권장 예산 */}
          {income>0&&(
            <div style={{background:"#1E293B",borderRadius:14,padding:"16px 18px"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#94A3B8",marginBottom:12}}>다음 달 권장 예산</div>
              {CATS.map(function(cat){
                return <div key={cat.key} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:7}}>
                  <span style={{color:"#94A3B8"}}>{cat.emoji+" "+cat.label}</span>
                  <span style={{color:cat.color,fontWeight:600}}>{fmt(Math.round(income*cat.pct/100))+" ("+cat.pct+"%)"}</span>
                </div>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  var today = new Date();
  var curMonthKey = getMonthKey(today);

  var [screen,     setScreen]    = useState("home");
  var [toast,      setToast]     = useState(null);
  var [reportMonth,setReportMonth]= useState(null);
  var [popupMonth, setPopupMonth] = useState(null);
  var [viewMonth,  setViewMonth] = useState(curMonthKey);
  var [familyView, setFamilyView]= useState("mine");

  // 홈 인라인 입력
  var [incomeText,  setIncomeText]  = useState("");
  var [expenseText, setExpenseText] = useState("");
  var [incLoading,  setIncLoading]  = useState(false);
  var [expLoading,  setExpLoading]  = useState(false);
  var incRef = useRef(null);
  var expRef = useRef(null);

  // 내 기록
  var [myRecords, setMyRecords] = useState(function(){
    try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); }catch(e){ return []; }
  });

  // 가족방
  var [roomCode,  setRoomCode]  = useState(function(){ return localStorage.getItem(ROOM_KEY)||""; });
  var [myName,    setMyName]    = useState(function(){ return localStorage.getItem(NAME_KEY)||""; });
  var [roomData,  setRoomData]  = useState(null);
  var [syncing,   setSyncing]   = useState(false);
  var [inputCode, setInputCode] = useState("");
  var [inputName, setInputName] = useState("");

  useEffect(function(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(myRecords)); }catch(e){}
  },[myRecords]);

  useEffect(function(){
    var isFirst = today.getDate()===1;
    var prevKey = getPrevMonthKey(curMonthKey);
    var seenKey = SEEN_KEY+"_"+prevKey;
    var seen = localStorage.getItem(seenKey);
    if(isFirst&&!seen){
      var prev = myRecords.filter(function(r){ return r.monthKey===prevKey; });
      if(prev.length>0){ setPopupMonth(prevKey); localStorage.setItem(seenKey,"1"); }
    }
  },[]);

  useEffect(function(){
    if(!roomCode) return;
    syncRoom();
    var id = setInterval(syncRoom, 8000);
    return function(){ clearInterval(id); };
  },[roomCode, myRecords, myName]);

  async function syncRoom(){
    if(!roomCode||!myName) return;
    setSyncing(true);
    var data = await sharedGet(roomCode);
    if(!data) data = {members:{}, created:Date.now()};
    data.members[myName] = myRecords;
    await sharedSet(roomCode, data);
    setRoomData(data);
    setSyncing(false);
  }

  function showToast(msg, ok){
    if(ok===undefined) ok=true;
    setToast({msg,ok});
    setTimeout(function(){ setToast(null); }, 2500);
  }

  // 수입 기록
  async function handleIncome(){
    if(!incomeText.trim()) return;
    setIncLoading(true);
    try {
      var result = await aiClassify(incomeText, "수입");
      var now = new Date();
      setMyRecords(function(prev){
        return [{
          id:Date.now(), type:"수입", category:result.category,
          amount:result.amount, description:result.description,
          date:now.toLocaleDateString("ko-KR"), monthKey:getMonthKey(now), ts:now.getTime()
        }].concat(prev);
      });
      setIncomeText("");
      showToast("💰 "+result.description+" "+fmt(result.amount)+" 기록됨!");
      if(incRef.current) incRef.current.focus();
    } catch(e){ showToast("다시 입력해 주세요", false); }
    setIncLoading(false);
  }

  // 지출 기록
  async function handleExpense(){
    if(!expenseText.trim()) return;
    setExpLoading(true);
    try {
      var result = await aiClassify(expenseText, "지출");
      var now = new Date();
      setMyRecords(function(prev){
        return [{
          id:Date.now(), type:"지출", category:result.category,
          amount:result.amount, description:result.description,
          date:now.toLocaleDateString("ko-KR"), monthKey:getMonthKey(now), ts:now.getTime()
        }].concat(prev);
      });
      setExpenseText("");
      showToast("💸 "+result.description+" "+fmt(result.amount)+" 기록됨!");
      if(expRef.current) expRef.current.focus();
    } catch(e){ showToast("다시 입력해 주세요", false); }
    setExpLoading(false);
  }

  // 가족방
  async function handleCreateRoom(){
    if(!inputName.trim()){ showToast("이름을 입력해주세요", false); return; }
    var code = genCode();
    var data = {members:{}, created:Date.now()};
    data.members[inputName] = myRecords;
    var ok = await sharedSet(code, data);
    if(!ok){ showToast("생성 실패. 다시 시도해주세요", false); return; }
    localStorage.setItem(ROOM_KEY, code);
    localStorage.setItem(NAME_KEY, inputName);
    setRoomCode(code); setMyName(inputName); setRoomData(data);
    setScreen("familyDone");
  }
  async function handleJoinRoom(){
    if(!inputCode.trim()||!inputName.trim()){ showToast("코드와 이름을 모두 입력해주세요", false); return; }
    var code = inputCode.trim().toUpperCase();
    var data = await sharedGet(code);
    if(!data){ showToast("존재하지 않는 방 코드예요", false); return; }
    data.members[inputName] = myRecords;
    await sharedSet(code, data);
    localStorage.setItem(ROOM_KEY, code);
    localStorage.setItem(NAME_KEY, inputName);
    setRoomCode(code); setMyName(inputName); setRoomData(data);
    setScreen("familyDone");
  }
  async function handleLeaveRoom(){
    if(roomData&&roomCode){
      var data = JSON.parse(JSON.stringify(roomData));
      delete data.members[myName];
      await sharedSet(roomCode, data);
    }
    localStorage.removeItem(ROOM_KEY); localStorage.removeItem(NAME_KEY);
    setRoomCode(""); setMyName(""); setRoomData(null); setFamilyView("mine");
    showToast("가족방에서 나왔어요");
    setScreen("home");
  }

  // 집계
  var members = roomData ? Object.keys(roomData.members) : [];
  var allRoomRecs = [];
  if(roomData){
    members.forEach(function(name){
      (roomData.members[name]||[]).forEach(function(r){
        allRoomRecs.push(Object.assign({},r,{memberName:name}));
      });
    });
  }
  var sourceRecs = (familyView==="total"||familyView==="member") && roomData ? allRoomRecs : myRecords;
  var allMonths = []; var seenM = {};
  myRecords.concat(allRoomRecs).forEach(function(r){ if(!seenM[r.monthKey]){ seenM[r.monthKey]=true; allMonths.push(r.monthKey); }});
  allMonths.sort().reverse();
  if(allMonths.indexOf(viewMonth)===-1) allMonths.unshift(viewMonth);

  var monthRecs    = sourceRecs.filter(function(r){ return r.monthKey===viewMonth; });
  var totalIncome  = monthRecs.filter(function(r){ return r.type==="수입"; }).reduce(function(s,r){ return s+r.amount; },0);
  var totalExpense = monthRecs.filter(function(r){ return r.type==="지출"; }).reduce(function(s,r){ return s+r.amount; },0);
  var balance      = totalIncome - totalExpense;
  var savePct      = totalIncome>0 ? Math.round((balance/totalIncome)*100) : 0;
  var byCat = {};
  monthRecs.filter(function(r){ return r.type==="지출"; }).forEach(function(r){
    byCat[r.category]=(byCat[r.category]||0)+r.amount;
  });
  var memberStats = members.map(function(name,i){
    var recs = (roomData.members[name]||[]).filter(function(r){ return r.monthKey===viewMonth; });
    var inc = recs.filter(function(r){ return r.type==="수입"; }).reduce(function(s,r){ return s+r.amount; },0);
    var exp = recs.filter(function(r){ return r.type==="지출"; }).reduce(function(s,r){ return s+r.amount; },0);
    return {name, income:inc, expense:exp, balance:inc-exp, color:MEMBER_COLORS[i%MEMBER_COLORS.length]};
  });
  var myMonthRecs = myRecords.filter(function(r){ return r.monthKey===curMonthKey; });
  var myIncome    = myMonthRecs.filter(function(r){ return r.type==="수입"; }).reduce(function(s,r){ return s+r.amount; },0);
  var myExpense   = myMonthRecs.filter(function(r){ return r.type==="지출"; }).reduce(function(s,r){ return s+r.amount; },0);
  var myBalance   = myIncome - myExpense;
  var dispIncome  = familyView==="mine" ? myIncome  : totalIncome;
  var dispExpense = familyView==="mine" ? myExpense : totalExpense;
  var dispBalance = familyView==="mine" ? myBalance : balance;

  var S = { fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif", background:"#0A0F1E", minHeight:"100vh", color:"#F1F5F9", maxWidth:480, margin:"0 auto", paddingBottom:48 };

  // ══════════════════════════════════════════════════
  // 홈
  // ══════════════════════════════════════════════════
  if(screen==="home") return (
    <div style={S}>
      {/* 헤더 */}
      <div style={{background:"linear-gradient(160deg,#1E1B4B 0%,#0A0F1E 100%)",padding:"36px 24px 24px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div>
            <div style={{fontSize:22,fontWeight:900,color:"#A5B4FC",letterSpacing:-0.5}}>경자야 놀자</div>
            <div style={{fontSize:12,color:"#475569",marginTop:2}}>경제적 자유를 위한 기록</div>
          </div>
          <button onClick={function(){ setScreen("family"); }} style={{
            background:roomCode?"rgba(129,140,248,0.15)":"linear-gradient(90deg,#6366F1,#8B5CF6)",
            border:roomCode?"1px solid #6366F1":"none",
            color:"#fff",borderRadius:12,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"
          }}>{roomCode?"👨‍👩‍👧 "+members.length+"명":"+ 가족 연동"}</button>
        </div>

        {/* 가족 뷰 탭 */}
        {roomCode && (
          <div style={{display:"flex",gap:6,marginBottom:16}}>
            {[["mine","내 기록"],["member","멤버별"],["total","전체 합산"]].map(function(x){
              return <button key={x[0]} onClick={function(){ setFamilyView(x[0]); }} style={{flex:1,padding:"8px 0",borderRadius:10,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",background:familyView===x[0]?"linear-gradient(90deg,#6366F1,#8B5CF6)":"#1E293B",color:familyView===x[0]?"#fff":"#64748B"}}>{x[1]}</button>;
            })}
          </div>
        )}

        {/* 잔액 카드 */}
        <div style={{background:"rgba(99,102,241,0.12)",border:"1px solid rgba(99,102,241,0.25)",borderRadius:20,padding:"20px 22px"}}>
          <div style={{fontSize:12,color:"#A5B4FC",marginBottom:4}}>
            {getMonthLabel(curMonthKey)+" 잔액"}
            {syncing&&<span style={{color:"#475569",marginLeft:6,fontSize:10}}>동기화중...</span>}
          </div>
          <div style={{fontSize:36,fontWeight:900,color:dispBalance>=0?"#A5F3FC":"#FCA5A5",marginBottom:6}}>{fmt(dispBalance)}</div>
          <div style={{display:"flex",gap:20,fontSize:13}}>
            <span style={{color:"#86EFAC"}}>{"수입 "+fmt(dispIncome)}</span>
            <span style={{color:"#FCA5A5"}}>{"지출 "+fmt(dispExpense)}</span>
          </div>
          {/* 멤버 바 */}
          {familyView==="total" && memberStats.length>0 && (
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
              {memberStats.map(function(m){
                var pct = dispExpense>0?Math.min(100,Math.round((m.expense/dispExpense)*100)):0;
                return (
                  <div key={m.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <div style={{width:6,height:6,borderRadius:99,background:m.color,flexShrink:0}} />
                    <div style={{fontSize:11,color:"#A5B4FC",width:44,flexShrink:0}}>{m.name}</div>
                    <div style={{flex:1,background:"rgba(0,0,0,0.3)",borderRadius:99,height:5}}>
                      <div style={{width:pct+"%",height:"100%",background:m.color,borderRadius:99}} />
                    </div>
                    <div style={{fontSize:11,color:m.color,fontWeight:700,minWidth:70,textAlign:"right"}}>{fmt(m.expense)}</div>
                  </div>
                );
              })}
            </div>
          )}
          {familyView==="member" && memberStats.length>0 && (
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
              {memberStats.map(function(m){
                return (
                  <div key={m.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <div style={{width:26,height:26,borderRadius:99,background:m.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#0A0F1E",flexShrink:0}}>{m.name.charAt(0)}</div>
                    <div style={{flex:1,fontSize:12}}>{m.name}{m.name===myName&&<span style={{fontSize:9,color:"#818CF8",marginLeft:4}}>나</span>}</div>
                    <div style={{fontSize:12,color:"#86EFAC",marginRight:8}}>{"+"+fmt(m.income)}</div>
                    <div style={{fontSize:12,color:"#FCA5A5"}}>{"−"+fmt(m.expense)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 인라인 입력 영역 ── */}
      <div style={{padding:"20px 24px 0"}}>

        {/* 수입 입력 */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"#86EFAC",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:18}}>💰</span> 수입 입력
          </div>
          <div style={{display:"flex",gap:10}}>
            <input
              ref={incRef}
              value={incomeText}
              onChange={function(e){ setIncomeText(e.target.value); }}
              onKeyDown={function(e){ if(e.key==="Enter"){ handleIncome(); }}}
              placeholder="예) 월급 300만원, 알바비 50만원"
              style={{
                flex:1, background:"#1E293B", border:"2px solid #064E3B",
                color:"#F1F5F9", borderRadius:14, padding:"16px 18px",
                fontSize:16, outline:"none", fontFamily:"inherit",
              }}
            />
            <button onClick={handleIncome} disabled={incLoading||!incomeText.trim()} style={{
              width:64, borderRadius:14, border:"none", flexShrink:0,
              background:incLoading||!incomeText.trim()?"#1E293B":"linear-gradient(135deg,#059669,#10B981)",
              color:incLoading||!incomeText.trim()?"#475569":"#fff",
              fontSize:24, cursor:incLoading||!incomeText.trim()?"default":"pointer",
              fontWeight:900,
            }}>{incLoading?"...":"✓"}</button>
          </div>
        </div>

        {/* 지출 입력 */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:"#FCA5A5",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:18}}>💸</span> 지출 입력
          </div>
          <div style={{display:"flex",gap:10}}>
            <input
              ref={expRef}
              value={expenseText}
              onChange={function(e){ setExpenseText(e.target.value); }}
              onKeyDown={function(e){ if(e.key==="Enter"){ handleExpense(); }}}
              placeholder="예) 점심 8천원, 마트 45000원"
              style={{
                flex:1, background:"#1E293B", border:"2px solid #7F1D1D",
                color:"#F1F5F9", borderRadius:14, padding:"16px 18px",
                fontSize:16, outline:"none", fontFamily:"inherit",
              }}
            />
            <button onClick={handleExpense} disabled={expLoading||!expenseText.trim()} style={{
              width:64, borderRadius:14, border:"none", flexShrink:0,
              background:expLoading||!expenseText.trim()?"#1E293B":"linear-gradient(135deg,#DC2626,#EF4444)",
              color:expLoading||!expenseText.trim()?"#475569":"#fff",
              fontSize:24, cursor:expLoading||!expenseText.trim()?"default":"pointer",
              fontWeight:900,
            }}>{expLoading?"...":"✓"}</button>
          </div>
        </div>

        {/* 하단 메뉴 */}
        <div style={{display:"flex",gap:10}}>
          <button onClick={function(){ setScreen("history"); }} style={{flex:1,padding:"16px 0",borderRadius:16,border:"1px solid #1E293B",background:"#1E293B",color:"#94A3B8",fontSize:15,fontWeight:700,cursor:"pointer"}}>📋 내역</button>
          <button onClick={function(){ setScreen("summary"); }} style={{flex:1,padding:"16px 0",borderRadius:16,border:"1px solid #1E293B",background:"#1E293B",color:"#94A3B8",fontSize:15,fontWeight:700,cursor:"pointer"}}>📊 분석</button>
          <button onClick={function(){ setReportMonth(null); setScreen("report"); }} style={{flex:1,padding:"16px 0",borderRadius:16,border:"1px solid #1E293B",background:"#1E293B",color:"#94A3B8",fontSize:15,fontWeight:700,cursor:"pointer"}}>📅 결산</button>
        </div>

        {/* 오늘 최근 기록 미리보기 */}
        {(function(){
          var todayStr  = today.toLocaleDateString("ko-KR");
          var todayRecs = myRecords.filter(function(r){ return r.date===todayStr; }).slice(0,3);
          if(todayRecs.length===0) return null;
          return (
            <div style={{marginTop:20}}>
              <div style={{fontSize:12,color:"#475569",marginBottom:8,fontWeight:600}}>오늘 기록 ({myRecords.filter(function(r){ return r.date===todayStr; }).length}건)</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {todayRecs.map(function(r){
                  var c = CATS.find(function(x){ return x.key===r.category; });
                  return (
                    <div key={r.id} style={{background:"#1E293B",borderRadius:12,padding:"11px 16px",display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:18}}>{c?c.emoji:"📦"}</span>
                      <div style={{flex:1,fontSize:13,fontWeight:600}}>{r.description}</div>
                      <div style={{fontSize:14,fontWeight:800,color:r.type==="수입"?"#22C55E":"#F87171"}}>
                        {(r.type==="수입"?"+":"−")+fmt(r.amount)}
                      </div>
                    </div>
                  );
                })}
                {myRecords.filter(function(r){ return r.date===todayStr; }).length>3 && (
                  <button onClick={function(){ setScreen("history"); }} style={{background:"none",border:"none",color:"#6366F1",fontSize:13,cursor:"pointer",textAlign:"center",padding:"4px 0"}}>전체 보기 →</button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {popupMonth&&<MonthReport report={buildReport(myRecords,popupMonth)} onClose={function(){ setPopupMonth(null); }} isPopup={true} />}
      {toast&&<div style={{position:"fixed",bottom:32,left:"50%",transform:"translateX(-50%)",background:toast.ok?"#1E293B":"#450A0A",border:"1px solid "+(toast.ok?"#334155":"#7F1D1D"),color:"#F1F5F9",padding:"13px 24px",borderRadius:14,fontSize:14,fontWeight:700,zIndex:9999,whiteSpace:"nowrap",boxShadow:"0 4px 24px rgba(0,0,0,0.5)"}}>{toast.msg}</div>}
    </div>
  );

  // ══════════════════════════════════════════════════
  // 내역
  // ══════════════════════════════════════════════════
  if(screen==="history") return (
    <div style={S}>
      <div style={{padding:"28px 24px 20px",borderBottom:"1px solid #1E293B"}}>
        <button onClick={function(){ setScreen("home"); }} style={{background:"none",border:"none",color:"#64748B",fontSize:15,cursor:"pointer",marginBottom:16,padding:0}}>← 뒤로</button>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:22,fontWeight:900}}>기록 내역</div>
          <select value={viewMonth} onChange={function(e){ setViewMonth(e.target.value); }}
            style={{background:"#1E293B",border:"1px solid #334155",color:"#CBD5E1",borderRadius:10,padding:"8px 12px",fontSize:14,cursor:"pointer"}}>
            {allMonths.map(function(m){ return <option key={m} value={m}>{getMonthLabel(m)}</option>; })}
          </select>
        </div>
        {roomCode&&<div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["mine","내 기록"],["member","멤버별"],["total","전체 합산"]].map(function(x){
            return <button key={x[0]} onClick={function(){ setFamilyView(x[0]); }} style={{flex:1,padding:"7px 0",borderRadius:10,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",background:familyView===x[0]?"linear-gradient(90deg,#6366F1,#8B5CF6)":"#1E293B",color:familyView===x[0]?"#fff":"#64748B"}}>{x[1]}</button>;
          })}
        </div>}
        <div style={{display:"flex",gap:10}}>
          {[["수입",totalIncome,"#22C55E"],["지출",totalExpense,"#F87171"],["잔액",balance,balance>=0?"#A5F3FC":"#FCA5A5"]].map(function(x){
            return <div key={x[0]} style={{flex:1,background:"#1E293B",borderRadius:14,padding:"13px 10px",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#64748B",marginBottom:3}}>{x[0]}</div>
              <div style={{fontSize:15,fontWeight:800,color:x[2]}}>{fmt(x[1])}</div>
            </div>;
          })}
        </div>
      </div>
      <div style={{padding:"20px 24px"}}>
        {monthRecs.length===0 ? (
          <div style={{textAlign:"center",padding:"60px 0",color:"#334155"}}>
            <div style={{fontSize:48,marginBottom:12}}>📝</div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>기록이 없어요</div>
            <div style={{fontSize:14,color:"#475569"}}>홈에서 바로 입력해보세요</div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {monthRecs.map(function(rec){
              var c = CATS.find(function(x){ return x.key===rec.category; });
              var mIdx = rec.memberName ? members.indexOf(rec.memberName) : -1;
              var mColor = mIdx>=0 ? MEMBER_COLORS[mIdx%MEMBER_COLORS.length] : null;
              return (
                <div key={rec.id||rec.ts} style={{background:"#1E293B",borderRadius:16,padding:"15px 18px",display:"flex",alignItems:"center",gap:12,borderLeft:mColor?"3px solid "+mColor:"none"}}>
                  <div style={{width:42,height:42,borderRadius:13,background:(c?c.color:"#64748B")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{c?c.emoji:"📦"}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>{rec.description}</div>
                    <div style={{fontSize:12,color:"#64748B"}}>
                      {c?c.label:rec.category}
                      {rec.memberName&&<span style={{color:mColor||"#64748B"}}>{" · "+rec.memberName}</span>}
                      {" · "+rec.date}
                    </div>
                  </div>
                  <div style={{fontSize:16,fontWeight:800,color:rec.type==="수입"?"#22C55E":"#F87171"}}>
                    {(rec.type==="수입"?"+":"−")+fmt(rec.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════
  // 분석
  // ══════════════════════════════════════════════════
  if(screen==="summary") {
    var topCats = CATS.filter(function(c){ return byCat[c.key]>0; }).sort(function(a,b){ return (byCat[b.key]||0)-(byCat[a.key]||0); }).slice(0,5);
    var maxAmt  = Math.max.apply(null, topCats.map(function(c){ return byCat[c.key]||0; }).concat([1]));
    return (
      <div style={S}>
        <div style={{padding:"28px 24px 20px",borderBottom:"1px solid #1E293B"}}>
          <button onClick={function(){ setScreen("home"); }} style={{background:"none",border:"none",color:"#64748B",fontSize:15,cursor:"pointer",marginBottom:16,padding:0}}>← 뒤로</button>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:22,fontWeight:900}}>지출 분석</div>
            <select value={viewMonth} onChange={function(e){ setViewMonth(e.target.value); }}
              style={{background:"#1E293B",border:"1px solid #334155",color:"#CBD5E1",borderRadius:10,padding:"8px 12px",fontSize:14,cursor:"pointer"}}>
              {allMonths.map(function(m){ return <option key={m} value={m}>{getMonthLabel(m)}</option>; })}
            </select>
          </div>
          {roomCode&&<div style={{display:"flex",gap:6}}>
            {[["mine","내 기록"],["member","멤버별"],["total","전체 합산"]].map(function(x){
              return <button key={x[0]} onClick={function(){ setFamilyView(x[0]); }} style={{flex:1,padding:"7px 0",borderRadius:10,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",background:familyView===x[0]?"linear-gradient(90deg,#6366F1,#8B5CF6)":"#1E293B",color:familyView===x[0]?"#fff":"#64748B"}}>{x[1]}</button>;
            })}
          </div>}
        </div>
        <div style={{padding:"24px"}}>
          <div style={{background:"linear-gradient(135deg,#1E1B4B,#312E81)",borderRadius:20,padding:"24px",marginBottom:24,textAlign:"center"}}>
            <div style={{fontSize:13,color:"#A5B4FC",marginBottom:6}}>{getMonthLabel(viewMonth)+" 결산"}</div>
            <div style={{fontSize:38,fontWeight:900,color:balance>=0?"#A5F3FC":"#FCA5A5",marginBottom:4}}>{fmt(balance)}</div>
            <div style={{fontSize:14,color:"#818CF8",marginBottom:16}}>{savePct>=15?"✅ 저축률 "+savePct+"% 목표달성!":savePct>=0?"⚠️ 저축률 "+savePct+"% 조금 더 절약해요":"🚨 저축률 "+savePct+"% 적자예요"}</div>
            <div style={{display:"flex",justifyContent:"center",gap:28}}>
              <div><div style={{fontSize:12,color:"#86EFAC",marginBottom:2}}>수입</div><div style={{fontSize:18,fontWeight:800,color:"#86EFAC"}}>{fmt(totalIncome)}</div></div>
              <div style={{width:1,background:"rgba(255,255,255,0.1)"}} />
              <div><div style={{fontSize:12,color:"#FCA5A5",marginBottom:2}}>지출</div><div style={{fontSize:18,fontWeight:800,color:"#FCA5A5"}}>{fmt(totalExpense)}</div></div>
            </div>
          </div>
          {familyView==="member"&&memberStats.length>0&&(
            <div style={{marginBottom:24}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:"#94A3B8"}}>멤버별 현황</div>
              {memberStats.map(function(m){
                return (
                  <div key={m.name} style={{background:"#1E293B",borderRadius:14,padding:"14px 18px",marginBottom:8,borderLeft:"3px solid "+m.color,display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:36,height:36,borderRadius:99,background:m.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,color:"#0A0F1E",flexShrink:0}}>{m.name.charAt(0)}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,marginBottom:3}}>{m.name}{m.name===myName&&<span style={{fontSize:9,color:"#818CF8",marginLeft:5,background:"rgba(99,102,241,0.2)",borderRadius:4,padding:"1px 5px"}}>나</span>}</div>
                      <div style={{fontSize:12,color:"#64748B"}}>{"+"+fmt(m.income)+" / −"+fmt(m.expense)}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:800,color:m.balance>=0?"#A5F3FC":"#FCA5A5"}}>{fmt(m.balance)}</div>
                  </div>
                );
              })}
            </div>
          )}
          {topCats.length>0?(
            <div>
              <div style={{fontSize:14,fontWeight:700,marginBottom:14,color:"#94A3B8"}}>어디에 가장 많이 썼나요?</div>
              {topCats.map(function(cat){
                var amt = byCat[cat.key]||0;
                var bar = Math.round((amt/maxAmt)*100);
                var rPct= totalIncome>0?Math.round((amt/totalIncome)*100):0;
                var over= totalIncome>0&&rPct>cat.pct;
                return (
                  <div key={cat.key} style={{marginBottom:18}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:22}}>{cat.emoji}</span><span style={{fontSize:15,fontWeight:700}}>{cat.label}</span></div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:15,fontWeight:800,color:over?"#F87171":cat.color}}>{fmt(amt)}</div>
                        <div style={{fontSize:11,color:"#64748B"}}>{over?"⚠️ 권장 "+cat.pct+"% 초과":"권장 "+cat.pct+"% 이내"}</div>
                      </div>
                    </div>
                    <div style={{background:"#1E293B",borderRadius:99,height:12,overflow:"hidden"}}>
                      <div style={{width:bar+"%",height:"100%",background:over?"linear-gradient(90deg,#EF4444,#F97316)":"linear-gradient(90deg,"+cat.color+","+cat.color+"88)",borderRadius:99}} />
                    </div>
                  </div>
                );
              })}
            </div>
          ):<div style={{textAlign:"center",padding:"40px 0",color:"#334155",fontSize:14}}>지출 기록이 없어요</div>}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // 가족방
  // ══════════════════════════════════════════════════
  if(screen==="family") return (
    <div style={S}>
      <div style={{padding:"28px 24px"}}>
        <button onClick={function(){ setScreen("home"); }} style={{background:"none",border:"none",color:"#64748B",fontSize:15,cursor:"pointer",marginBottom:24,padding:0}}>← 뒤로</button>
        {!roomCode ? (
          <div>
            <div style={{textAlign:"center",marginBottom:32}}>
              <div style={{fontSize:52,marginBottom:12}}>👨‍👩‍👧‍👦</div>
              <div style={{fontSize:24,fontWeight:900,marginBottom:8}}>가족 연동</div>
              <div style={{fontSize:14,color:"#64748B",lineHeight:1.7}}>방 코드 하나로 가족이 함께<br/>수입·지출을 합쳐서 볼 수 있어요</div>
            </div>
            <div style={{fontSize:13,color:"#64748B",marginBottom:6}}>내 이름</div>
            <input value={inputName} onChange={function(e){ setInputName(e.target.value); }}
              placeholder="예) 아빠, 엄마, 홍길동"
              style={{width:"100%",background:"#1E293B",border:"1px solid #334155",color:"#F1F5F9",borderRadius:12,padding:"14px 16px",fontSize:16,outline:"none",boxSizing:"border-box",marginBottom:12}}
            />
            <button onClick={handleCreateRoom} style={{width:"100%",padding:"17px 0",borderRadius:14,border:"none",background:"linear-gradient(135deg,#6366F1,#8B5CF6)",color:"#fff",fontSize:17,fontWeight:800,cursor:"pointer",marginBottom:20}}>새 방 만들기</button>
            <div style={{background:"#1E293B",borderRadius:16,padding:"20px"}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:"#94A3B8"}}>코드로 참여하기</div>
              <input value={inputCode} onChange={function(e){ setInputCode(e.target.value.toUpperCase()); }}
                placeholder="6자리 코드" maxLength={6}
                style={{width:"100%",background:"#0A0F1E",border:"1px solid #334155",color:"#F1F5F9",borderRadius:12,padding:"14px",fontSize:22,fontWeight:800,letterSpacing:6,outline:"none",boxSizing:"border-box",marginBottom:10,textAlign:"center"}}
              />
              <button onClick={handleJoinRoom} style={{width:"100%",padding:"14px 0",borderRadius:12,border:"1px solid #334155",background:"#0A0F1E",color:"#818CF8",fontSize:16,fontWeight:700,cursor:"pointer"}}>참여하기</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{background:"linear-gradient(135deg,#1E1B4B,#312E81)",borderRadius:20,padding:"24px",marginBottom:20,textAlign:"center"}}>
              <div style={{fontSize:13,color:"#A5B4FC",marginBottom:4}}>가족방 코드</div>
              <div style={{fontSize:36,fontWeight:900,letterSpacing:6,color:"#818CF8",marginBottom:4}}>{roomCode}</div>
              <div style={{fontSize:13,color:"#64748B"}}>이 코드를 가족에게 알려주세요</div>
            </div>
            <div style={{background:"#1E293B",borderRadius:16,padding:"20px",marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:14,color:"#94A3B8"}}>{"멤버 ("+members.length+"명)"}</div>
              {members.map(function(name,i){
                var ms = memberStats.find(function(m){ return m.name===name; })||{expense:0};
                return (
                  <div key={name} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                    <div style={{width:38,height:38,borderRadius:99,background:MEMBER_COLORS[i%MEMBER_COLORS.length],display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,color:"#0A0F1E",flexShrink:0}}>{name.charAt(0)}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700}}>{name}{name===myName&&<span style={{fontSize:10,color:"#818CF8",marginLeft:5,background:"rgba(99,102,241,0.2)",borderRadius:4,padding:"1px 5px"}}>나</span>}</div>
                      <div style={{fontSize:12,color:"#64748B"}}>{"이번달 지출 "+fmt(ms.expense)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={handleLeaveRoom} style={{width:"100%",padding:"15px 0",borderRadius:14,border:"1px solid #7F1D1D",background:"rgba(127,29,29,0.2)",color:"#FCA5A5",fontSize:16,fontWeight:700,cursor:"pointer"}}>방 나가기</button>
          </div>
        )}
      </div>
      {toast&&<div style={{position:"fixed",bottom:32,left:"50%",transform:"translateX(-50%)",background:"#1E293B",color:"#F1F5F9",padding:"13px 24px",borderRadius:14,fontSize:14,fontWeight:700,zIndex:9999,whiteSpace:"nowrap"}}>{toast.msg}</div>}
    </div>
  );

  if(screen==="familyDone") return (
    <div style={Object.assign({},S,{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px"})}>
      <div style={{fontSize:64,marginBottom:20}}>🎉</div>
      <div style={{fontSize:26,fontWeight:900,marginBottom:8}}>연동 완료!</div>
      <div style={{fontSize:15,color:"#94A3B8",marginBottom:32,textAlign:"center"}}>이제 가족과 함께 가계부를 쓸 수 있어요</div>
      <div style={{background:"#1E293B",borderRadius:16,padding:"20px 32px",marginBottom:32,textAlign:"center"}}>
        <div style={{fontSize:13,color:"#64748B",marginBottom:6}}>방 코드</div>
        <div style={{fontSize:32,fontWeight:900,letterSpacing:6,color:"#818CF8"}}>{roomCode}</div>
        <div style={{fontSize:12,color:"#64748B",marginTop:6}}>가족에게 이 코드를 알려주세요</div>
      </div>
      <button onClick={function(){ setScreen("home"); }} style={{width:"100%",maxWidth:320,padding:"18px 0",borderRadius:16,border:"none",background:"linear-gradient(135deg,#6366F1,#8B5CF6)",color:"#fff",fontSize:18,fontWeight:800,cursor:"pointer"}}>홈으로 가기</button>
    </div>
  );

  // 결산 화면
  if(screen==="report") return (
    <div style={S}>
      <div style={{padding:"28px 24px 20px",borderBottom:"1px solid #1E293B"}}>
        <button onClick={function(){ setScreen("home"); }} style={{background:"none",border:"none",color:"#64748B",fontSize:15,cursor:"pointer",marginBottom:16,padding:0}}>← 뒤로</button>
        <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>월별 결산</div>
        <div style={{fontSize:13,color:"#64748B",marginBottom:16}}>달을 선택하면 결산 리포트를 볼 수 있어요</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:4}}>
          {allMonths.map(function(m){
            return <button key={m} onClick={function(){ setReportMonth(m); }} style={{
              background:reportMonth===m?"linear-gradient(90deg,#6366F1,#8B5CF6)":"#1E293B",
              border:reportMonth===m?"none":"1px solid #334155",
              color:reportMonth===m?"#fff":"#94A3B8",
              borderRadius:10,padding:"9px 16px",fontSize:14,fontWeight:700,cursor:"pointer"
            }}>{getMonthLabel(m)}</button>;
          })}
        </div>
      </div>
      {reportMonth ? (
        <MonthReport report={buildReport(myRecords, reportMonth)} onClose={null} isPopup={false} />
      ) : (
        <div style={{textAlign:"center",padding:"60px 24px",color:"#334155"}}>
          <div style={{fontSize:42,marginBottom:12}}>📅</div>
          <div style={{fontSize:16,fontWeight:700,color:"#475569"}}>위에서 달을 선택하세요</div>
        </div>
      )}
    </div>
  );

  return null;
}