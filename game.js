'use strict';
(() => {
  const E = window.DeepBelow;
  const $ = selector => document.querySelector(selector);
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const map = $('#map'), mctx = map.getContext('2d');
  const T = 36, reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width=1000, height=650, scale=1, pixelRatio=1, camera={x:0,y:0}, last=performance.now();
  let game, pointer=null, keys=new Set(), particles=[], labels=[], rings=[], impacts=[], shake=0;
  let pickSwing=0, pickDirection=2, digSoundTimer=0, haulPulse=0, comboPulse=0;
  let clock=0, uiTimer=0, toastTimer=0, chapterTimer=0, rockHint=0, whisperHint=0, ambienceTimer=0, mapOpen=true;
  let audio=null, sound=false, storageOK=true, saved={bank:0,best:0,runs:0,wins:0,upgrades:{pick:0,boots:0,armor:0}};
  const elements = Object.fromEntries(['biome','depth','hearts','relics','objective','gems','combo','drill','drill-label','recharge','flare','flare-count','bank','threat'].map(id=>[id,$('#'+id)]));
  try {
    const old=JSON.parse(localStorage.getItem('deep-below-camp')||'null');
    if(old&&typeof old==='object') {
      for(const id of ['bank','best','runs','wins'])saved[id]=Math.max(0,Math.floor(Number(old[id])||0));
      for(const id of ['pick','boots','armor'])saved.upgrades[id]=Math.min(3,Math.max(0,Math.floor(Number(old.upgrades?.[id])||0)));
    }
  } catch { storageOK=false; }
  function persist() {try{localStorage.setItem('deep-below-camp',JSON.stringify(saved));}catch{storageOK=false;}}
  function setText(id,text) {if(elements[id].textContent!==String(text))elements[id].textContent=text;}
  function hash(x,y) {let n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);}
  function unlockAudio() {
    if(!sound)return;
    try {
      audio ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audio.state==='suspended')audio.resume().catch(()=>{});
    } catch {sound=false;}
  }
  function note(freq,duration=.13,type='sine',volume=.035,delay=0) {
    if(!sound||!audio||audio.state!=='running')return;
    try {
      const now=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();
      o.type=type;o.frequency.setValueAtTime(freq,now);g.gain.setValueAtTime(volume,now);
      g.gain.exponentialRampToValueAtTime(.001,now+duration);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+duration);
      o.onended=()=>{o.disconnect();g.disconnect();};
    } catch {sound=false;}
  }
  function digSound(rock,drill) {
    if(digSoundTimer>0&&!rock)return;
    digSoundTimer=drill?.09:.07;
    note(rock?165:drill?95:125,.055,rock?'square':'triangle',rock?.022:.014);
    if(rock){note(740,.035,'triangle',.024);note(310,.065,'triangle',.018,.025);}
  }
  function chord() {[392,494,587,784].forEach((f,i)=>note(f,.4,'sine',.04,i*.09));}
  function toast(message,time=3.5) {$('#toast').textContent=message;$('#toast').style.opacity=1;toastTimer=time;}
  function announce(name) {$('#chapter strong').textContent=name;$('#chapter').style.opacity=1;chapterTimer=3;}
  function clearInput() {pointer=null;keys.clear();}
  function showPanel(html) {
    clearInput();$('#panel').innerHTML=html;$('#overlay').classList.remove('hidden');
    if($('#start, #resume, #again'))window.DeepBelowInstall?.mount($('#panel'));
    // Focus the actual action, without moving Safari's visual viewport.
    const first=$('#panel button:not(:disabled)');if(first)first.focus({preventScroll:true});
  }
  function hidePanel() {$('#overlay').classList.add('hidden');canvas.focus({preventScroll:true});last=performance.now();}
  function shopHTML() {
    return '<div class="camp-heading"><span>UPPGRADERA I BASLÄGRET</span><strong>◆ '+saved.bank+' sparade</strong></div><div class="shop">'+E.UPGRADES.map(u=>{
      const level=saved.upgrades[u.id],cost=u.cost*(level+1);
      return '<button class="upgrade" data-upgrade="'+u.id+'" '+(level>=3||saved.bank<cost?'disabled':'')+'><strong>'+u.name+'</strong><small>'+u.text+'</small><span class="price">'+(level>=3?'FULLT UPPGRADERAD':'◆ '+cost+' · Nivå '+level+'/3')+'</span></button>';
    }).join('')+'</div>';
  }
  function bindShop(render) {
    document.querySelectorAll('[data-upgrade]').forEach(button=>button.addEventListener('click',()=>{
      const upgrade=E.UPGRADES.find(u=>u.id===button.dataset.upgrade),level=saved.upgrades[upgrade.id],cost=upgrade.cost*(level+1);
      if(level>=3||saved.bank<cost)return;saved.bank-=cost;saved.upgrades[upgrade.id]++;persist();unlockAudio();chord();render();
    }));
  }
  function camp() {
    showPanel('<span class="eyebrow">BORTOM NATTPORTEN</span><h1 id="panel-title">DJUPT<br><em>UNDER</em></h1>'+
      '<p class="tagline">Det finns ett djup som ljuset aldrig når.</p>'+
      '<p>Tre reliker öppnar den förseglade Nattporten.<br>Därunder väntar dödsriket, tre gömda reliker<br>och fasor som aldrig borde ha väckts.</p>'+
      '<div class="pill-row"><span><b>↯</b> Borra genom sten</span><span><b>✦</b> Bedöva med bloss</span><span><b>◆</b> Säkra fynd och uppgradera</span></div>'+
      '<button id="start" class="primary">Börja expeditionen ↘</button>'+
      '<div class="instructions">HÅLL ETT FINGER FÖR ATT GÅ OCH GRÄVA · ETT ANDRA FÖR VERKTYG<br>MUS ELLER WASD / PILTANGENTER · MELLANSLAG FÖR BORR · F FÖR BLOSS</div>'+
      (saved.runs>0?shopHTML():'<div class="panel-note">Återvänd till ytan när du vill för att säkra dina diamanter.</div>')+
      (!storageOK?'<div class="panel-note">Uppgraderingarna sparas under det här besöket. Webbläsaren kan inte spara dem till nästa gång.</div>':''));
    $('#start').addEventListener('click',start);bindShop(camp);
  }
  function start() {
    unlockAudio();game=new E.Game(Date.now()^Math.floor(Math.random()*1e9),saved.upgrades);game.start();
    particles=[];labels=[];rings=[];impacts=[];shake=0;pickSwing=0;digSoundTimer=0;haulPulse=0;comboPulse=0;clearInput();hidePanel();updateHUD();drawMap();
    toast('Håll i en riktning för att gräva. Följ ◇ till den första reliken.',5);
  }
  function pause() {
    if(game.state!=='playing')return;game.pause();clearInput();
    showPanel('<span class="eyebrow">EXPEDITIONEN ÄR PAUSAD</span><h2 id="panel-title">Ta ett andetag.</h2>'+
      '<p>Håll i en riktning för att gå. Borren tar dig genom sten och ormar. Bloss bedövar ormar i närheten och lockar bort andra.</p>'+
      '<p>De första tre relikerna öppnar Nattporten vid grottans botten. Tre till ligger gömda i dödsriket. För hem alla sex, eller återvänd tidigare och säkra dina fynd.</p>'+
      '<p>I dödsriket tar bett två hjärtan. Fasor går genom väggar: lämna den röda ringen innan de anfaller. Bloss driver bort dem, borren bedövar dem. Kistor ger hjärtan och bloss.</p>'+
      '<p>Följ diamantådrorna. Samla utan fyra sekunders uppehåll för att nå dubbelt, tredubbelt och fyrdubbelt värde. Men ådrorna leder ofta mot ormarna.</p>'+
      '<p>Ormar stannar upp när de hör dig. Bryt sikten och sluta gräva så söker de vid ditt senaste spår. Ta sidotunneln, följ svansen eller borra genom den guldspruckna stenen.</p>'+
      '<p>Lyktornas ljuscirklar är trygga viloplatser. I dödsriket visar bleka fjädrar, ögonristningar och glödande sprickor vägen till gömda reliker.</p>'+
      '<div class="run-perks">'+[...game.perks].map(id=>E.PERKS.find(p=>p.id===id).name).join(' · ')+'</div>'+
      '<button id="resume" class="primary">Fortsätt utforska</button>');
    $('#resume').addEventListener('click',()=>{unlockAudio();game.resume();hidePanel();});
  }
  function chooseRelic(event) {
    const message=game.player.relics===3?'De tre sigillen brister. Nattporten vid grottans botten är öppen. Vågar du fortsätta ner, eller tar du fynden hem?':event.index>=3?'Något märker att en del av dess mörker saknas. Jakten blir snabbare. Välj en kraft för vägen hem.':'Reliken delar med sig av sin kraft. Välj en gåva för den här expeditionen.';
    showPanel('<span class="eyebrow">RELIK '+game.player.relics+' AV 6 HITTAD</span><h2 id="panel-title">'+event.name+'</h2>'+
      '<p>'+message+'</p>'+
      '<div class="choices">'+game.choices.map(p=>'<button class="choice" data-perk="'+p.id+'"><span class="perk-icon">'+p.icon+'</span><strong>'+p.name+'</strong><small>'+p.text+'</small></button>').join('')+'</div>'+
      '<p class="instructions">+'+event.amount+' DIAMANTER · UPP TILL TVÅ HJÄRTAN ÅTERSTÄLLDA · NY KRAFT</p>');
    document.querySelectorAll('[data-perk]').forEach(b=>b.addEventListener('click',()=>{
      unlockAudio();if(!game.choose(b.dataset.perk))return;hidePanel();chord();updateHUD();
      if(game.player.relics===3){announce('Nattporten är öppen.');toast('Följ portens tecken neråt. Du kan också återvända och säkra dina fynd.',7);}
      else if(game.player.relics===6){announce('Mörkret vill ha er tillbaka.');toast('Alla sex är dina. Tillbaka genom Nattporten, sedan upp till ytan!',7);}
      else if(game.player.relics>3)toast('Dödsriket vaknar. Håll ett bloss redo. Du kan fortfarande vända om.',6);
      else toast('En ny kraft. Ett djupare mysterium.');
    }));
  }
  function results(event) {
    saved.bank+=event.earned;saved.runs++;saved.best=Math.max(saved.best,event.earned);if(event.complete)saved.wins++;persist();
    const render=()=>{
      showPanel('<span class="eyebrow">'+(event.complete?'TILLBAKA FRÅN DÖDSRIKET':event.escaped?'TILLBAKA I BASLÄGRET':'RÄDDNINGEN ÄR HÄR')+'</span>'+
        '<h2 id="panel-title">'+(event.complete?'Till och med mörkret släppte taget.':event.upperComplete?'Du tog ljuset med dig hem.':event.escaped?'Lite rikare. Lite klokare.':'Djupet behåller sina hemligheter.')+'</h2>'+
        '<p>'+(event.complete?'Alla sex reliker är i trygghet. Du hör fortfarande viskningarna, men ovanför dig finns himlen.':event.upperComplete?event.relics+' av sex reliker är i trygghet. Det var klokt att överleva. Dödsrikets återstående hemligheter väntar på en ny expedition.':event.escaped?'Dina diamanter är i trygghet. Uppgradera utrustningen och ge dig ner i en ny grotta.':'Räddarna fick med sig en fjärdedel av dina diamanter. Relikerna blev kvar i djupet. Rusta dig och prova en ny väg.')+'</p>'+
        '<div class="run-stats"><div><strong>◆ '+event.earned+'</strong><small>SPARADE</small></div><div><strong>'+event.depth+'m</strong><small>DJUPASTE</small></div><div><strong>'+event.relics+'/6</strong><small>'+(event.escaped?'RÄDDADE RELIKER':'HITTADE RELIKER')+'</small></div></div>'+
        shopHTML()+'<button id="again" class="primary">En ny expedition ↘</button><div class="panel-note">Bästa fynd: '+saved.best+' · '+Math.floor(event.seconds/60)+'m '+event.seconds%60+'s under jord'+(!storageOK?' · Framstegen sparas under det här besöket':'')+'</div>');
      $('#again').addEventListener('click',start);bindShop(render);
    };render();
  }
  function burst(x,y,color,count=12,dir=null,rock=false) {
    if(reducedMotion)count=Math.ceil(count*.4);
    const d=dir===null?{x:0,y:0}:E.DIRS[dir];
    for(let i=0;i<count;i++)particles.push({x:x*T+T/2,y:y*T+T/2,vx:(Math.random()-.5)*150-d.x*85,vy:(Math.random()-.6)*150-d.y*85,life:.25+Math.random()*.35,color,size:(rock?3:2)+Math.random()*(rock?5:3)});
    if(particles.length>180)particles.splice(0,particles.length-180);
  }
  function events() {
    for(const event of game.drainEvents()) {
      const p=game.player;
      if(event.type==='dig'){
        burst(event.x,event.y,event.rock?'#b8c3ba':E.BIOMES[E.biomeAt(event.y)].soil[2],event.rock?16:event.drill?8:6,event.dir,event.rock);
        impacts.push({x:event.x*T+18,y:event.y*T+18,dir:event.dir,rock:event.rock,life:.22});
        pickSwing=.16;pickDirection=event.dir;digSound(event.rock,event.drill);
        if(event.drill)shake=Math.max(shake,event.rock?.16:.08);
      }
      if(event.type==='gem') {
        const color=event.multiplier===4?'#ffe3a0':'#b4ffe1';haulPulse=.22;
        burst(event.x,event.y,color,6+event.multiplier*2);labels.push({x:event.x*T+18,y:event.y*T,text:'+'+event.amount,color,life:.8});
        note([523,587,659,784,880][(event.combo-1)%5]*Math.pow(2,(event.multiplier-1)/3),.15,'sine',.025);
        if(event.milestone){
          comboPulse=.5;const x=p.x*T+18,y=p.y*T-22;
          labels.push({x,y,text:'×'+event.multiplier+(event.multiplier===4?' DIAMANTYRA!':' DIAMANTSVIT!'),color:'#ffe3a0',life:1.35,large:true});
          if(!reducedMotion)rings.push({x:p.x*T+18,y:p.y*T+18,r:10,life:.45,color:'#ffe3a0'});
          [659,880,1318].forEach((f,i)=>note(f*(event.multiplier/2),.22,'sine',.025,i*.07));
        }
      }
      if(event.type==='chest'){burst(event.x,event.y,'#f8cd75',22);toast('Förrådskista! +'+event.amount+' diamanter, +'+event.supply+' bloss, +'+event.supply+' hjärtan');chord();}
      if(event.type==='rock'&&rockHint<=0){toast('Hård sten. Tryck på Turboborra för att ta dig igenom.');rockHint=4;}
      if(event.type==='sealed'&&rockHint<=0){toast(event.gate?'Nattporten är förseglad. Hämta de tre relikerna ovanför.':'En uråldrig försegling. Bara Nattporten släpper dig igenom.',5);rockHint=4;}
      if(event.type==='gate'){shake=.5;note(55,1.5,'triangle',.06);}
      if(event.type==='nether'){toast('Dödsriket. Följ spåren i berget till dolda reliker. Bloss driver bort fasorna; lämna deras röda ringar.',8);note(46,2,'sine',.07);}
      if(event.type==='discovery')toast('I mörkret glimmar '+event.name+'. Platsen är markerad på kartan.',5);
      if(event.type==='trail'){chapterTimer=0;$('#chapter').style.opacity=0;toast(E.TRAILS[event.index].hint,7);note(440+event.index*110,.7,'sine',.025);}
      if(event.type==='refuge'){chapterTimer=0;$('#chapter').style.opacity=0;toast(event.name+'. Inne i ljuscirkeln når varken ormar eller fasor dig. Hämta andan.',6);note(330,.9,'sine',.025);note(494,.9,'sine',.02,.15);}
      if(event.type==='tactics')toast('Ormen vaktar passagen. Ta en sidotunnel, locka bort den med bloss eller borra genom den guldspruckna stenen.',7);
      if(event.type==='snake-notice'&&game.seen[E.key(event.x,event.y)]&&Math.hypot(event.x-p.x,event.y-p.y)<10)note(130,.2,'triangle',.018);
      if(event.type==='whisper'){
        chapterTimer=0;$('#chapter').style.opacity=0;
        if(whisperHint<=0){toast('En fasa siktar på dig. Lämna den röda ringen!',3);note(68,.8,'sawtooth',.015);whisperHint=5;}
      }
      if(event.type==='drill'){shake=.18;note(110,.3,'sawtooth',.025);}
      if(event.type==='flare'){burst(event.x,event.y,'#ffb980',28);rings.push({x:p.x*T+18,y:p.y*T+18,r:12,life:1,color:'#ffc490'});note(220,.3,'triangle');}
      if(event.type==='hurt'){shake=.4;burst(p.x,p.y,'#ed997d',20);toast(event.source==='horror'?'Fasan nådde dig! Tänd ett bloss och fly.':'Ormbett! Borra dig bort eller tänd ett bloss.',2);note(85,.35,'sawtooth',.035);}
      if(event.type==='biome')announce(event.name);
      if(event.type==='relic'){chord();chooseRelic(event);}
      if(event.type==='end'){event.escaped?chord():note(100,.6,'triangle');results(event);}
    }
  }
  function direction() {
    if(keys.has('arrowup')||keys.has('w'))return 0;
    if(keys.has('arrowright')||keys.has('d'))return 1;
    if(keys.has('arrowdown')||keys.has('s'))return 2;
    if(keys.has('arrowleft')||keys.has('a'))return 3;
    if(!pointer)return null;
    const r=canvas.getBoundingClientRect(),p=game.player;
    const dx=(pointer.x-r.left)/scale-(p.x*T+T/2-camera.x);
    const dy=(pointer.y-r.top)/scale-(p.y*T+T/2-camera.y);
    if(Math.hypot(dx,dy)<13)return null;
    return Math.abs(dx)>Math.abs(dy)?(dx>0?1:3):(dy>0?2:0);
  }
  // A single captured pointer owns steering. Tool fingers never replace or release it.
  canvas.addEventListener('pointerdown',event=>{
    if(game.state!=='playing'||pointer||event.button>0)return;event.preventDefault();unlockAudio();
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
    try{canvas.setPointerCapture(event.pointerId);}catch{/* Capture may be unavailable after an OS gesture cancellation. */}
  });
  canvas.addEventListener('pointermove',event=>{if(pointer?.id===event.pointerId){event.preventDefault();pointer.x=event.clientX;pointer.y=event.clientY;}});
  const release=event=>{if(pointer?.id===event.pointerId)pointer=null;};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,release);
  window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  function toolButton(selector,action) {
    const button=$(selector);
    let lastPointerActivation=-Infinity;
    button.addEventListener('pointerdown',event=>{
      if(event.button>0)return;event.preventDefault();event.stopPropagation();lastPointerActivation=performance.now();unlockAudio();if(!button.disabled)action();
    });
    // Keyboard / accessibility activation has no pointerdown. Ignore synthesized touch clicks.
    button.addEventListener('click',event=>{event.preventDefault();if(event.detail===0&&performance.now()-lastPointerActivation>700&&!button.disabled){unlockAudio();action();}});
    button.addEventListener('contextmenu',event=>event.preventDefault());
  }
  function drill() {const d=direction();if(d!==null)game.player.dir=d;game.drill();events();updateHUD();}
  function flare() {game.flare();events();updateHUD();}
  toolButton('#drill',drill);toolButton('#flare',flare);
  $('#pause').addEventListener('click',pause);
  $('#bank').addEventListener('click',()=>{if(game.state==='playing'&&game.player.y===E.SURFACE&&game.player.bag>0){game.finish(true);events();}});
  $('#map-toggle').addEventListener('click',()=>{mapOpen=!mapOpen;$('#map-wrap').classList.toggle('hidden',!mapOpen);$('#map-toggle').setAttribute('aria-pressed',String(mapOpen));});
  $('#sound').addEventListener('click',()=>{sound=!sound;unlockAudio();$('#sound').textContent=sound?'Ljud på':'Ljud av';$('#sound').setAttribute('aria-pressed',String(sound));$('#sound').setAttribute('aria-label',sound?'Stäng av ljudet':'Slå på ljudet');note(523);});
  window.addEventListener('keydown',event=>{
    const key=event.key.toLowerCase();
    if(!$('#overlay').classList.contains('hidden')) {
      if(key==='tab') {
        const buttons=[...$('#panel').querySelectorAll('button:not(:disabled), summary, a[href]')].filter(el=>el.getClientRects().length&&(!el.closest('details:not([open])')||el.matches('summary'))),first=buttons[0],lastButton=buttons[buttons.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();lastButton?.focus();}
        else if(!event.shiftKey&&document.activeElement===lastButton){event.preventDefault();first?.focus();}
      }
      if((key==='escape'||key==='p')&&game.state==='paused')$('#resume').click();
      return;
    }
    if(['arrowup','arrowright','arrowdown','arrowleft','w','a','s','d'].includes(key)){event.preventDefault();keys.add(key);}
    if(event.repeat)return;
    if(key===' '){event.preventDefault();unlockAudio();drill();}
    if(key==='f'){event.preventDefault();unlockAudio();flare();}
    if(key==='p'||key==='escape')pause();
    if(key==='m')$('#map-toggle').click();
  });
  window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur',()=>{clearInput();pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});
  function resize() {
    const r=canvas.getBoundingClientRect();scale=Math.max(1,r.width/1150);width=r.width/scale;height=r.height/scale;
    pixelRatio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(r.width*pixelRatio);canvas.height=Math.round(r.height*pixelRatio);
    ctx.setTransform(pixelRatio*scale,0,0,pixelRatio*scale,0,0);clearInput();
  }
  window.addEventListener('resize',resize);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',resize);
  function updateHUD() {
    const p=game.player,b=E.BIOMES[E.biomeAt(p.y)],target=game.target();
    setText('biome',b.name.toUpperCase());setText('depth',Math.max(0,p.y-E.SURFACE)*2+'m');
    setText('hearts','♥'.repeat(p.hp)+'♡'.repeat(p.maxHp-p.hp));elements.hearts.setAttribute('aria-label',p.hp+' av '+p.maxHp+' hjärtan');
    const upper=Math.min(3,p.relics),lower=Math.max(0,p.relics-3);
    setText('relics','◆'.repeat(upper)+'◇'.repeat(3-upper)+(game.gate.open?' · '+'◆'.repeat(lower)+'◇'.repeat(3-lower):''));
    elements.relics.setAttribute('aria-label',p.relics+' av '+(game.gate.open?6:3)+' reliker');
    if(target){const dx=target.x-p.x,dy=target.y-p.y,arrow=Math.abs(dx)>Math.abs(dy)?(dx>0?'→':'←'):(dy>0?'↓':'↑');setText('objective',arrow+' '+target.name+' · '+Math.round(Math.hypot(dx,dy)*2)+'m');}
    else {const clue=game.nearbyClue();setText('objective',clue?'Reliker dolda · följ '+E.TRAILS[clue.relic-3].name:'Utforska mörkret · '+(6-p.relics)+' reliker dolda');}
    $('#expedition').classList.toggle('nether',p.y>E.GATE_Y);
    const refuge=game.refugeAt(p),snakes=game.snakes.filter(s=>s.alert&&s.stun<=0&&Math.hypot(s.body[0].x-p.x,s.body[0].y-p.y)<12);
    setText('threat',refuge?refuge.name+' · Här är du trygg.':snakes.some(s=>s.notice>0)?'Ormen lyssnar. Välj din väg.':snakes.some(s=>s.mode==='hunt')?'Ormen ser dig. Bryt sikten eller tänd ett bloss.':snakes.length?'Ormen söker vid ditt senaste spår.':'Något följer dig genom mörkret.');
    elements.threat.classList.toggle('calm',!!refuge);
    setText('gems',p.bag);setText('combo',game.combo>=5?'×'+Math.min(4,1+Math.floor(game.combo/5))+' DIAMANTSVIT':'');
    elements.combo.classList.toggle('active',game.combo>=5);
    elements.combo.setAttribute('aria-label',game.combo>=5?'Diamantsvit: '+Math.min(4,1+Math.floor(game.combo/5))+' gånger diamantvärdet':'');
    setText('flare-count',p.flares);elements.flare.disabled=p.flares<1||game.state!=='playing';
    elements.drill.disabled=p.drillCooldown>0||game.state!=='playing';
    setText('drill-label',p.drillCooldown>0?'LADDAR '+p.drillCooldown.toFixed(1)+'s':'REDO');
    const maximum=Math.max(2.4,7-saved.upgrades.boots)*(game.perks.has('drill')?.5:1);
    elements.recharge.style.width=(1-p.drillCooldown/maximum)*100+'%';
    elements.bank.classList.toggle('hidden',!(game.state==='playing'&&p.y===E.SURFACE&&p.bag>0));
    elements.threat.classList.toggle('hidden',(!game.threat&&!refuge)||game.state!=='playing');
  }
  function drawMap() {
    if(!mapOpen)return;const nether=game.player.y>E.GATE_Y,start=nether?E.GATE_Y:0,end=nether?E.HEIGHT:E.GATE_Y+1,sy=192/(end-start);
    $('#map-caption').textContent=nether?'DÖDSRIKET · ◇ RELIK':'GROTTORNA · ◇ RELIK';
    mctx.fillStyle=nether?'#100d19':'#10221e';mctx.fillRect(0,0,116,192);
    for(let y=start;y<end;y++)for(let x=0;x<E.WIDTH;x++)if(game.seen[E.key(x,y)]) {
      mctx.fillStyle=y<=E.SURFACE?'#6d9364':game.grid[y][x]>=3?'#6c537f':game.grid[y][x]===0?(nether?'#817190':'#8b9871'):E.BIOMES[E.biomeAt(y)].soil[0];mctx.fillRect(x*2,(y-start)*sy,2,Math.ceil(sy));
    }
    for(const r of game.relics){if(r.y<start||r.y>=end||(r.hidden&&!r.discovered))continue;mctx.fillStyle=r.taken?'#87946b':'#f6cc7d';mctx.save();mctx.translate(r.x*2+1,(r.y-start)*sy+1);mctx.rotate(Math.PI/4);mctx.fillRect(-2,-2,4,4);mctx.restore();}
    for(const r of game.refuges)if(r.y>=start&&r.y<end&&game.seen[E.key(r.x,r.y)]){mctx.strokeStyle='#c7eab3';mctx.lineWidth=1;mctx.beginPath();mctx.arc(r.x*2+1,(r.y-start)*sy+1,3,0,7);mctx.stroke();}
    mctx.fillStyle=game.gate.open?'#e9b9ff':'#9d6a99';mctx.fillRect(E.GATE_X*2-3,(E.GATE_Y-start)*sy,8,3);
    const p=game.player;mctx.fillStyle='#fff6ce';mctx.beginPath();mctx.arc(p.x*2+1,(p.y-start)*sy+1,2.5,0,7);mctx.fill();
  }
  function diamond(x,y,size,color='#8fefd0') {
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x+size*.8,y-size*.25);ctx.lineTo(x,y+size);ctx.lineTo(x-size*.8,y-size*.25);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#f2ffe7aa';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-size*.8,y-size*.25);ctx.lineTo(x+size*.8,y-size*.25);ctx.lineTo(x,y+size);ctx.lineTo(x-size*.2,y-size*.25);ctx.lineTo(x,y-size);ctx.stroke();
  }
  function tile(x,y) {
    const type=game.grid[y][x],n=hash(x,y),b=E.BIOMES[E.biomeAt(y)],xx=x*T,yy=y*T;
    if(y<=E.SURFACE) {
      ctx.fillStyle=y===E.SURFACE?'#688254':'#78917c';ctx.fillRect(xx,yy,T,T);
      if(y===E.SURFACE){ctx.fillStyle='#bec17e';ctx.fillRect(xx,yy,T,4);ctx.fillStyle='#9bb56e';for(let i=0;i<3;i++)ctx.fillRect(xx+3+i*12,yy-3-n*5,2,7);}
      return;
    }
    if(!game.seen[E.key(x,y)]){ctx.fillStyle=y>E.GATE_Y?'#100d19':'#14201c';ctx.fillRect(xx,yy,T+1,T+1);return;}
    if(type>=3){ctx.fillStyle='#211b2b';ctx.fillRect(xx,yy,T+1,T+1);ctx.strokeStyle='#7a537f';ctx.lineWidth=2;ctx.strokeRect(xx+3,yy+5,T-6,T-10);ctx.fillStyle='#b08dba';ctx.font='17px Georgia';ctx.fillText('ᛟ',xx+12,yy+24);return;}
    if(type!==0) {
      ctx.fillStyle=type===2?(y>E.GATE_Y?'#5c5067':'#66716b'):b.soil[Math.floor(n*3)];ctx.fillRect(xx,yy,T+1,T+1);
      ctx.fillStyle='#00000024';ctx.fillRect(xx,yy,T,2);ctx.fillRect(xx,yy,1,T);
      if(game.grid[y-1]?.[x]===0){ctx.fillStyle=type===2?'#a3aaa0':'#c6ac7655';ctx.fillRect(xx,yy,T,4);}
      if(game.grid[y]?.[x-1]===0){ctx.fillStyle='#00000040';ctx.fillRect(xx,yy,4,T);}
      ctx.fillStyle='#d8bb8333';ctx.fillRect(xx+4+n*18,yy+8,3,2);ctx.fillRect(xx+24,yy+25,2,2);
      if(type===2||n>.67){ctx.strokeStyle=type===2?'#b6c1b177':'#1a1e174a';ctx.lineWidth=type===2?2:1;ctx.beginPath();ctx.moveTo(xx+8,yy+3);ctx.lineTo(xx+15,yy+13);ctx.lineTo(xx+11,yy+20);ctx.lineTo(xx+25,yy+30);ctx.stroke();}
      if(type===2&&game.shortcuts.has(E.key(x,y))){ctx.strokeStyle='#f6cd80';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx+19,yy+3);ctx.lineTo(xx+12,yy+16);ctx.lineTo(xx+23,yy+19);ctx.lineTo(xx+16,yy+33);ctx.stroke();}
    } else {
      ctx.fillStyle=b.floor;ctx.fillRect(xx,yy,T+1,T+1);
      ctx.fillStyle='#aaa47822';ctx.fillRect(xx+7+n*10,yy+26,3,2);
      if(n>.85&&!game.items.has(E.key(x,y))) {
        if(E.biomeAt(y)===0){ctx.fillStyle='#718c5a';ctx.fillRect(xx+9,yy+23,2,7);ctx.fillStyle='#a2c780';ctx.beginPath();ctx.ellipse(xx+10,yy+21,6,3,0,0,7);ctx.fill();}
        else if(E.biomeAt(y)===1){ctx.fillStyle='#779bc266';ctx.beginPath();ctx.moveTo(xx+8,yy+32);ctx.lineTo(xx+11,yy+17);ctx.lineTo(xx+17,yy+30);ctx.fill();}
        else if(y<=E.GATE_Y){ctx.fillStyle='#db855555';ctx.fillRect(xx+9,yy+28,9,1);}
        else{ctx.strokeStyle='#aa8ba655';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx+6,yy+28);ctx.lineTo(xx+25,yy+21);ctx.moveTo(xx+12,yy+22);ctx.lineTo(xx+15,yy+29);ctx.stroke();ctx.fillStyle='#cf91ad66';ctx.fillRect(xx+25,yy+12,2,2);}
      }
    }
  }
  function campDrawing() {
    ctx.fillStyle='#344d37';ctx.beginPath();ctx.moveTo(30*T,4*T);ctx.lineTo(31*T,1.7*T);ctx.lineTo(32*T,4*T);ctx.fill();
    ctx.fillStyle='#c7ad74';ctx.beginPath();ctx.moveTo(30.6*T,4*T);ctx.lineTo(31*T,2.7*T);ctx.lineTo(31.4*T,4*T);ctx.fill();
    ctx.fillStyle='#af915c';ctx.fillRect(26*T,2*T,4,2*T);ctx.fillRect(26*T,2*T,2*T,24);
    ctx.fillStyle='#f3e4b2';ctx.font='bold 9px Arial';ctx.fillText('BASLÄGER',26*T+5,2*T+15);
    ctx.fillStyle='#d5b779';ctx.fillRect(28*T,2*T,3,2*T);ctx.fillRect(28*T+20,2*T,3,2*T);
    for(let y=2*T+7;y<4*T;y+=12)ctx.fillRect(28*T,y,22,3);
    ctx.fillStyle='#cf9b58';ctx.fillRect(33*T,3.3*T,22,18);ctx.fillStyle='#e8c27e';ctx.fillRect(33*T,3.3*T+7,22,3);
  }
  function temples() {
    for(const r of game.relics) {
      if(!game.seen[E.key(r.x,r.y)])continue;
      const color=E.BIOMES[E.biomeAt(r.y)].color,x=r.x*T+18,y=r.y*T+18;
      ctx.strokeStyle=color+'55';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+10,75,35,0,0,7);ctx.stroke();
      for(const side of [-1,1]){ctx.fillStyle='#71816a';ctx.fillRect(x+side*95-7,y-40,14,75);ctx.fillStyle='#98a58a';ctx.fillRect(x+side*95-11,y-43,22,8);ctx.fillStyle=color;ctx.fillRect(x+side*95-2,y-27,4,16);}
      ctx.fillStyle='#7c8465';ctx.fillRect(x-19,y+10,38,9);ctx.fillRect(x-13,y+4,26,8);
      if(!r.taken){const glow=ctx.createRadialGradient(x,y,5,x,y,100);glow.addColorStop(0,color+'30');glow.addColorStop(1,color+'00');ctx.fillStyle=glow;ctx.fillRect(x-100,y-100,200,200);}
    }
  }
  function drawRefuges() {
    for(const r of game.refuges){
      if(!game.seen[E.key(r.x,r.y)])continue;
      const x=r.x*T+18,y=r.y*T+18,radius=r.radius*T;
      if(x<camera.x-radius||x>camera.x+width+radius||y<camera.y-radius||y>camera.y+height+radius)continue;
      ctx.save();ctx.translate(x,y);
      const glow=ctx.createRadialGradient(0,0,8,0,0,radius+20);glow.addColorStop(0,'#eed7a34d');glow.addColorStop(.75,'#badca51c');glow.addColorStop(1,'#badca500');ctx.fillStyle=glow;ctx.fillRect(-radius-20,-radius-20,radius*2+40,radius*2+40);
      ctx.strokeStyle='#c6e8b8b0';ctx.lineWidth=2;ctx.setLineDash([8,9]);ctx.beginPath();ctx.arc(0,0,radius,0,7);ctx.stroke();ctx.setLineDash([]);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.fillStyle='#d6e4ac';ctx.fillRect(Math.cos(a)*radius-3,Math.sin(a)*radius-3,6,6);}
      ctx.fillStyle='#4d5442';ctx.fillRect(-3,-48,6,48);ctx.fillStyle='#ddc18c';ctx.fillRect(-12,-54,24,5);ctx.fillRect(-10,-49,20,22);ctx.fillStyle='#fff0ba';ctx.fillRect(-6,-46,12,15);
      ctx.fillStyle='#dceaca';ctx.font='bold 12px Arial';ctx.textAlign='center';ctx.fillText(r.name.toUpperCase(),0,-radius-15);
      ctx.font='10px Arial';ctx.fillText('VILOPLATS',0,radius+20);ctx.restore();
    }
  }
  function drawClues() {
    for(const clue of game.clues){
      if(game.relics[clue.relic].taken||!game.seen[E.key(clue.x,clue.y)])continue;
      const x=clue.x*T+18,y=clue.y*T+18;
      if(x<camera.x-T||x>camera.x+width+T||y<camera.y-T||y>camera.y+height+T)continue;
      const trail=E.TRAILS[clue.relic-3],d=E.DIRS[clue.dir];
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(d.y,d.x));
      ctx.globalAlpha=reducedMotion?.8:.7+Math.sin(clock*1.8+clue.x*.3)*.12;
      const glow=ctx.createRadialGradient(0,0,1,0,0,17+clue.strength*10);glow.addColorStop(0,trail.color+'40');glow.addColorStop(1,trail.color+'00');ctx.fillStyle=glow;ctx.fillRect(-28,-28,56,56);
      ctx.strokeStyle=trail.color;ctx.lineWidth=1.7+clue.strength;ctx.beginPath();
      if(clue.relic===3){
        ctx.moveTo(-9,2);ctx.lineTo(11,-1);for(let j=-6;j<=3;j+=4){ctx.moveTo(j,1);ctx.lineTo(j-3,-6);ctx.moveTo(j,1);ctx.lineTo(j-4,6);}
      } else if(clue.relic===4){
        ctx.moveTo(-11,0);ctx.quadraticCurveTo(0,-13,11,0);ctx.quadraticCurveTo(0,13,-11,0);ctx.moveTo(5,-3);ctx.lineTo(5,3);
      } else {ctx.moveTo(-12,4);ctx.lineTo(-4,-3);ctx.lineTo(1,3);ctx.lineTo(11,-1);ctx.moveTo(-4,-3);ctx.lineTo(-5,-9);}
      ctx.stroke();ctx.fillStyle=trail.color;ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(9,-3);ctx.lineTo(9,3);ctx.fill();ctx.restore();
    }
  }
  function drawGate() {
    const g=game.gate,x=g.x*T+18,y=g.y*T+T;
    if(y<camera.y-140||y>camera.y+height+140||!game.seen[E.key(g.x,g.y-1)])return;
    ctx.save();ctx.translate(x,y);
    const aura=ctx.createRadialGradient(0,-45,8,0,-45,150);aura.addColorStop(0,g.open?'#a86cdb55':'#b075a433');aura.addColorStop(1,'#7b429000');ctx.fillStyle=aura;ctx.fillRect(-150,-195,300,300);
    ctx.fillStyle='#11101c';ctx.beginPath();ctx.moveTo(-43,0);ctx.lineTo(-43,-80);ctx.quadraticCurveTo(0,-145,43,-80);ctx.lineTo(43,0);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#87718d';ctx.lineWidth=13;ctx.stroke();ctx.strokeStyle='#c4a7cb';ctx.lineWidth=2;ctx.stroke();
    if(g.open){
      ctx.fillStyle='#37243f';ctx.fillRect(-27,-63,54,63);
      for(let i=0;i<7;i++){const offset=reducedMotion?i/7:(clock*.14+i/7)%1;ctx.strokeStyle='#c695d744';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,-34,12+offset*18,20+offset*30,0,0,7);ctx.stroke();}
    } else {
      ctx.fillStyle='#3b2a43';ctx.fillRect(-31,-69,62,69);
      for(let i=0;i<3;i++){const filled=game.relics[i].taken;diamond((i-1)*23,-48,8,filled?'#ffe2a5':'#796282');}
      ctx.strokeStyle='#cca7ce';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-31,-21);ctx.lineTo(31,-64);ctx.moveTo(-31,-64);ctx.lineTo(31,-21);ctx.stroke();
    }
    ctx.textAlign='center';ctx.font='bold 11px Arial';ctx.fillStyle='#eed9f1';ctx.fillText('NATTPORTEN',0,-145);
    ctx.font='10px Arial';ctx.fillStyle='#c9afcf';ctx.fillText(g.open?'DÖDSRIKET VÄNTAR':'TRE RELIKER BRYTER SIGILLET',0,26);ctx.restore();
  }
  function drawHorror(h,index) {
    const x=h.x*T+18,y=h.y*T+18;
    if(x<camera.x-100||x>camera.x+width+100||y<camera.y-100||y>camera.y+height+100||!game.seen[E.key(Math.round(h.x),Math.round(h.y))])return;
    ctx.save();ctx.translate(x,y);ctx.globalAlpha=h.stun>0?.35:.85;
    const phase=reducedMotion?0:clock;
    const aura=ctx.createRadialGradient(0,0,4,0,0,65);aura.addColorStop(0,'#d468bc44');aura.addColorStop(1,'#733e9400');ctx.fillStyle=aura;ctx.fillRect(-65,-65,130,130);
    ctx.strokeStyle=h.charge>0?'#e9a0c7':'#9f73b4';ctx.lineWidth=4;ctx.lineCap='round';
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4+index,wave=Math.sin(phase*2.5+i)*10;
      ctx.beginPath();ctx.moveTo(Math.cos(a)*10,Math.sin(a)*12);ctx.quadraticCurveTo(Math.cos(a+.5)*34,Math.sin(a+.5)*32,Math.cos(a)*42+wave,Math.sin(a)*38);ctx.stroke();
    }
    ctx.fillStyle='#140e20';ctx.beginPath();ctx.ellipse(0,0,19,24,Math.sin(phase)*.15,0,7);ctx.fill();ctx.strokeStyle='#a58abb';ctx.lineWidth=1;ctx.stroke();
    for(let i=0;i<5;i++){const a=i*2.4+index;ctx.fillStyle=h.stun>0?'#9da9b9':'#ffe1ed';ctx.beginPath();ctx.ellipse(Math.cos(a)*10,Math.sin(a)*14,4,2.4,a,0,7);ctx.fill();ctx.fillStyle='#702554';ctx.fillRect(Math.cos(a)*10-1,Math.sin(a)*14-2,2,4);}
    ctx.restore();
  }
  function horrorWarnings() {
    for(const h of game.horrors)if(h.charge>0&&h.target&&game.player.y>E.GATE_Y){
      const x=h.target.x*T+18,y=h.target.y*T+18;
      ctx.strokeStyle='#ff9cba';ctx.fillStyle='#e3557f35';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,29,0,7);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-11,y-11);ctx.lineTo(x+11,y+11);ctx.moveTo(x+11,y-11);ctx.lineTo(x-11,y+11);ctx.stroke();
      ctx.fillStyle='#ffd9e3';ctx.font='bold 11px Arial';ctx.textAlign='center';ctx.fillText('FLYTTA DIG',x,y-39);ctx.textAlign='start';
    }
  }
  function drawSnake(s) {
    if(!s.body.some(p=>game.seen[E.key(p.x,p.y)]&&p.x*T>camera.x-T*2&&p.x*T<camera.x+width+T*2&&p.y*T>camera.y-T*2&&p.y*T<camera.y+height+T*2))return;
    const blend=Math.min(1,s.timer/s.interval);
    const points=s.body.map((b,i)=>({x:((s.previous[i]?.x??b.x)+(b.x-(s.previous[i]?.x??b.x))*blend)*T+18,y:((s.previous[i]?.y??b.y)+(b.y-(s.previous[i]?.y??b.y))*blend)*T+18}));
    const color=s.stun>0?'#849d98':E.BIOMES[s.biome].snake;
    ctx.lineCap='round';ctx.lineJoin='round';
    for(let i=points.length-1;i>0;i--) {
      const a=points[i],b=points[i-1],size=i>points.length-4?8+(points.length-i)*4:27;
      ctx.strokeStyle='#091911';ctx.lineWidth=size+5;ctx.beginPath();ctx.moveTo(a.x,a.y+3);ctx.lineTo(b.x,b.y+3);ctx.stroke();
      ctx.strokeStyle=color;ctx.lineWidth=size;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      ctx.fillStyle='#273c3066';ctx.beginPath();ctx.ellipse(a.x,a.y,size*.3,size*.4,Math.atan2(b.y-a.y,b.x-a.x),0,7);ctx.fill();
      ctx.fillStyle='#e9e8ae3a';ctx.beginPath();ctx.arc(a.x-2,a.y-4,3,0,7);ctx.fill();
      if(s.nether&&i%2===0){ctx.fillStyle='#ecd7df';ctx.beginPath();ctx.moveTo(a.x-7,a.y-9);ctx.lineTo(a.x-2,a.y-21);ctx.lineTo(a.x+4,a.y-10);ctx.fill();}
    }
    const h=points[0],neck=points[1],angle=Math.atan2(h.y-neck.y,h.x-neck.x);
    ctx.save();ctx.translate(h.x,h.y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(3,0,19,14,0,0,7);ctx.fill();
    if(s.nether){ctx.fillStyle='#f6d2df';for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(12,side*9);ctx.lineTo(25,side*7);ctx.lineTo(15,side*3);ctx.fill();}}
    ctx.fillStyle=s.alert?'#ffebad':'#e9df9f';ctx.beginPath();ctx.arc(9,-8,4,0,7);ctx.arc(9,8,4,0,7);ctx.fill();ctx.fillStyle='#18271e';ctx.fillRect(9,-11,2,6);ctx.fillRect(9,5,2,6);
    if(Math.sin(clock*7)>0){ctx.strokeStyle='#e9a388';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(29,0);ctx.lineTo(34,-4);ctx.moveTo(29,0);ctx.lineTo(34,4);ctx.stroke();}ctx.restore();
    if(s.stun>0){ctx.fillStyle='#e1f6b7';ctx.font='17px Georgia';for(let i=0;i<3;i++)ctx.fillText('✦',h.x+Math.cos(clock*3+i*2.1)*24-6,h.y-24+Math.sin(clock*3+i*2.1)*7);}
    else if(s.notice>0){
      ctx.strokeStyle='#f7d48a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(h.x,h.y,28,reducedMotion?0:-Math.PI/2,reducedMotion?Math.PI*2:-Math.PI/2+Math.min(1,s.notice/(s.nether?.5:.7))*Math.PI*2);ctx.stroke();
      ctx.fillStyle='#ffe2a1';ctx.font='bold 19px Arial';ctx.fillText('!',h.x-3,h.y-34);
    } else if(s.alert){ctx.fillStyle=s.mode==='search'?'#e4ce96':'#ffb696';ctx.font='bold 17px Arial';ctx.fillText(s.mode==='search'?'?':'!',h.x-3,h.y-25);}
    else if(s.mode==='lured'){ctx.fillStyle='#ffd397';ctx.font='18px Arial';ctx.fillText('✦',h.x-7,h.y-25);}
  }
  function drawMiner(px,py) {
    const p=game.player,moving=p.blend<1,walk=moving?Math.sin(clock*23)*3:0,facing=p.dir===3?-1:1;
    ctx.save();ctx.translate(px,py);
    if(p.invincible>0&&Math.floor(clock*12)%2)ctx.globalAlpha=.5;
    ctx.fillStyle='#0d1817';ctx.beginPath();ctx.ellipse(0,14,13,5,0,0,7);ctx.fill();
    if(p.drilling){ctx.fillStyle='#f5c66b55';ctx.beginPath();ctx.arc(0,0,25,0,7);ctx.fill();}
    ctx.fillStyle='#233a3c';ctx.fillRect(-8,5+walk,6,10);ctx.fillRect(3,5-walk,6,10);
    ctx.fillStyle='#151f1f';ctx.fillRect(-10,12+walk,8,4);ctx.fillRect(3,12-walk,8,4);
    ctx.fillStyle='#ad7750';ctx.fillRect(-12,-9,7,18);
    ctx.fillStyle='#dfac66';ctx.fillRect(-8,-9,17,16);ctx.fillStyle='#785a3a';ctx.fillRect(-7,-7,3,14);ctx.fillRect(5,-7,2,14);
    ctx.fillStyle='#f4c799';ctx.fillRect(-7,-22,14,14);ctx.fillRect(facing>0?9:-13,-5+walk,4,9);
    ctx.fillStyle='#292e2c';ctx.fillRect(facing>0?4:-5,-17,2,3);
    ctx.fillStyle='#f1c86d';ctx.beginPath();ctx.arc(0,-23,11,Math.PI,0);ctx.fill();ctx.fillRect(-13,-24,26,5);
    ctx.fillStyle='#fff3c3';ctx.fillRect(facing>0?8:-12,-28,5,7);
    if(!p.drilling){
      const d=E.DIRS[pickSwing>0?pickDirection:p.dir],swing=reducedMotion?0:Math.sin(pickSwing/.16*Math.PI)*.95;
      ctx.save();ctx.translate(d.x*13,d.y*13);ctx.rotate(Math.atan2(d.y,d.x)+swing-.45);
      ctx.strokeStyle='#ad8151';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-3,7);ctx.lineTo(14,-8);ctx.stroke();
      ctx.strokeStyle=pickSwing>0?'#fff0c7':'#c2cab7';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(8,-17);ctx.quadraticCurveTo(19,-10,21,0);ctx.stroke();ctx.restore();
    }
    if(p.drilling){
      const d=E.DIRS[p.dir];ctx.translate(d.x*23,d.y*23);ctx.rotate(Math.atan2(d.y,d.x));
      ctx.strokeStyle='#f5c66b99';ctx.lineWidth=2;
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(-35,side*12);ctx.lineTo(-5,side*12);ctx.stroke();}
      ctx.fillStyle='#fff0af';ctx.beginPath();ctx.moveTo(23,0);ctx.lineTo(-3,-9);ctx.lineTo(-3,9);ctx.fill();
      ctx.strokeStyle='#b88b42';ctx.beginPath();for(let i=0;i<3;i++){const offset=reducedMotion?0:clock*35%5;ctx.moveTo(i*6+offset-3,-7+i*2);ctx.lineTo(i*6+offset+1,7-i*2);}ctx.stroke();
    }
    ctx.restore();
  }
  function draw() {
    const p=game.player,px=(p.oldX+(p.x-p.oldX)*p.blend)*T+18,py=(p.oldY+(p.y-p.oldY)*p.blend)*T+18;
    camera.x=Math.max(0,Math.min(E.WIDTH*T-width,px-width/2));
    camera.y=Math.max(0,Math.min(E.HEIGHT*T-height,py-height*.43));
    ctx.setTransform(pixelRatio*scale,0,0,pixelRatio*scale,0,0);ctx.clearRect(0,0,width,height);
    ctx.fillStyle='#14201c';ctx.fillRect(0,0,width,height);ctx.save();
    const shakeX=!reducedMotion&&shake>0?(Math.random()-.5)*shake*18:0,shakeY=!reducedMotion&&shake>0?(Math.random()-.5)*shake*18:0;
    ctx.translate(-camera.x+shakeX,-camera.y+shakeY);
    const x0=Math.max(0,Math.floor(camera.x/T)-1),x1=Math.min(E.WIDTH,Math.ceil((camera.x+width)/T)+1),y0=Math.max(0,Math.floor(camera.y/T)-1),y1=Math.min(E.HEIGHT,Math.ceil((camera.y+height)/T)+1);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)tile(x,y);
    if(y0<5)campDrawing();temples();drawGate();drawRefuges();drawClues();
    for(const item of game.items.values()) {
      if(item.x<x0||item.x>x1||item.y<y0||item.y>y1||!game.seen[E.key(item.x,item.y)])continue;
      const x=item.x*T+18,y=item.y*T+18;
      if(item.type==='gem'){
        // Mineral threads make nearby branches readable without revealing unseen tiles.
        ctx.strokeStyle='#80e8c64a';ctx.lineWidth=2;ctx.beginPath();
        for(const d of [E.DIRS[1],E.DIRS[2]]){
          const nx=item.x+d.x,ny=item.y+d.y;
          if(game.seen[E.key(nx,ny)]&&game.items.get(E.key(nx,ny))?.type==='gem'){ctx.moveTo(x,y);ctx.lineTo(x+d.x*T*.5+3,y+d.y*T*.5-3);ctx.lineTo(x+d.x*T,y+d.y*T);}
        }ctx.stroke();
        ctx.shadowColor='#80e8c6';ctx.shadowBlur=6;diamond(x,y,7+item.value,'#8fefd0');ctx.shadowBlur=0;if(hash(item.x,item.y)>.6&&Math.sin(clock*3+item.x)>.8){ctx.fillStyle='#e7ffe7';ctx.fillRect(x+10,y-10,2,5);ctx.fillRect(x+8,y-8,6,1);}
      }
      else if(item.type==='chest'){ctx.fillStyle='#443c25';ctx.fillRect(x-13,y-7,26,22);ctx.fillStyle='#cda969';ctx.fillRect(x-13,y-10,26,13);ctx.fillStyle='#ffe0a0';ctx.fillRect(x-3,y-2,6,7);ctx.strokeStyle='#e9c181';ctx.lineWidth=2;ctx.strokeRect(x-13,y-10,26,25);}
      else{ctx.shadowColor='#f9d591';ctx.shadowBlur=23;diamond(x,y-7+Math.sin(clock*2)*5,17,E.BIOMES[E.biomeAt(item.y)].color);ctx.shadowBlur=0;}
    }
    for(const s of game.snakes)drawSnake(s);
    game.horrors.forEach(drawHorror);
    for(const f of game.flares) {
      const x=f.x*T+18,y=f.y*T+18,g=ctx.createRadialGradient(x,y,4,x,y,150);g.addColorStop(0,'#f4ae6855');g.addColorStop(1,'#e49c5200');ctx.fillStyle=g;ctx.fillRect(x-150,y-150,300,300);
      ctx.fillStyle='#ffde91';ctx.beginPath();ctx.arc(x,y,6+Math.sin(clock*15)*2,0,7);ctx.fill();ctx.fillStyle='#fff6d8';ctx.fillRect(x-2,y-9,4,15);
    }
    for(const impact of impacts){
      const d=E.DIRS[impact.dir];ctx.save();ctx.translate(impact.x,impact.y);ctx.rotate(Math.atan2(d.y,d.x));
      ctx.globalAlpha=impact.life/.22;ctx.strokeStyle=impact.rock?'#fff0c7':'#d9b878';ctx.lineWidth=impact.rock?3:2;
      ctx.beginPath();ctx.arc(0,0,reducedMotion?16:12+(1-impact.life/.22)*8,-1.1,1.1);ctx.stroke();ctx.restore();
    }
    drawMiner(px,py);
    for(const effect of particles){ctx.globalAlpha=Math.min(1,effect.life*2);ctx.fillStyle=effect.color;ctx.fillRect(effect.x,effect.y,effect.size,effect.size);}ctx.globalAlpha=1;
    for(const ring of rings){ctx.globalAlpha=ring.life;ctx.strokeStyle=ring.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(ring.x,ring.y,ring.r,0,7);ctx.stroke();}ctx.globalAlpha=1;
    for(const label of labels){ctx.globalAlpha=Math.min(1,label.life*2);ctx.fillStyle=label.color;ctx.font=label.large?'bold 20px Arial':'bold 16px Arial';ctx.textAlign=label.large?'center':'left';ctx.fillText(label.text,label.x,label.y);}ctx.globalAlpha=1;ctx.textAlign='left';
    // Previously explored edges stay visible; undiscovered caves conceal their inhabitants.
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(y>E.SURFACE&&!game.seen[E.key(x,y)]){ctx.fillStyle=y>E.GATE_Y?'#100d19':'#14201c';ctx.fillRect(x*T,y*T,T+1,T+1);}
    ctx.restore();
    const nether=p.y>E.GATE_Y,lit=!!game.refugeAt(p)||game.flares.some(f=>Math.hypot(f.x-p.x,f.y-p.y)<f.radius),radius=nether?(game.perks.has('lantern')?320:240)+(lit?100:0):Math.max(330,width*.65);
    const glow=ctx.createRadialGradient(px-camera.x,py-camera.y,nether?45:70,px-camera.x,py-camera.y,radius);
    glow.addColorStop(0,nether?'#08051200':'#07161000');glow.addColorStop(1,nether?'#080512e8':'#071610b0');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    // Attack telegraphs stay readable even at the edge of the lamp's light.
    ctx.save();ctx.translate(-camera.x,-camera.y);horrorWarnings();ctx.restore();
    if(nether){
      ctx.fillStyle='#c7a1db55';for(let i=0;i<18;i++){const t=reducedMotion?0:clock;const x=(hash(i,8)*width+Math.sin(t*.2+i)*20+width)%width,y=(hash(i,4)*height-t*(3+i%3)+height*100)%height;ctx.fillRect(x,y,2,2);}
      ctx.strokeStyle='#a8618744';ctx.lineWidth=5;ctx.strokeRect(2,2,width-4,height-4);
    } else if(p.relics===6){ctx.strokeStyle='#f5bd5744';ctx.lineWidth=4;ctx.strokeRect(2,2,width-4,height-4);}
    if(pointer&&game.state==='playing') {
      const r=canvas.getBoundingClientRect(),x=(pointer.x-r.left)/scale,y=(pointer.y-r.top)/scale;
      ctx.strokeStyle='#f5d99799';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,16,0,7);ctx.stroke();ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.stroke();
    }
  }
  function frame(time) {
    const dt=Math.min(.05,(time-last)/1000);last=time;clock+=dt;
    game.update(dt,direction());events();shake=Math.max(0,shake-dt);rockHint=Math.max(0,rockHint-dt);whisperHint=Math.max(0,whisperHint-dt);
    pickSwing=Math.max(0,pickSwing-dt);digSoundTimer=Math.max(0,digSoundTimer-dt);haulPulse=Math.max(0,haulPulse-dt);comboPulse=Math.max(0,comboPulse-dt);
    elements.gems.style.color=haulPulse>0?'#fff3c9':'';
    elements.combo.style.transform=reducedMotion?'none':'scale('+(1+comboPulse*.25)+')';
    elements.combo.style.setProperty('--remaining',Math.max(0,game.comboTimer/4));
    for(const impact of impacts)impact.life-=dt;impacts=impacts.filter(impact=>impact.life>0);
    if(game.state==='playing'&&game.player.y>E.GATE_Y){ambienceTimer-=dt;if(ambienceTimer<=0){note(41,2.5,'sine',.035);note(43,2.2,'sine',.02,.15);ambienceTimer=5;}}
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=110*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);
    for(const l of labels){l.y-=26*dt;l.life-=dt;}labels=labels.filter(l=>l.life>0);
    for(const r of rings){r.r+=230*dt;r.life-=dt;}rings=rings.filter(r=>r.life>0);
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('#toast').style.opacity=0;}
    if(chapterTimer>0){chapterTimer-=dt;if(chapterTimer<=0)$('#chapter').style.opacity=0;}
    uiTimer+=dt;if(uiTimer>.12){uiTimer=0;updateHUD();drawMap();}
    draw();requestAnimationFrame(frame);
  }
  game=new E.Game(81497,saved.upgrades);resize();camp();updateHUD();drawMap();requestAnimationFrame(frame);
})();
