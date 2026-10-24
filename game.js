'use strict';
(() => {
  const E = window.DeepBelow;
  const $ = selector => document.querySelector(selector);
  const canvas = $('#game'), ctx = canvas.getContext('2d');
  const map = $('#map'), mctx = map.getContext('2d');
  const T = 36, reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width=1000, height=650, scale=1, pixelRatio=1, camera={x:0,y:0}, last=performance.now();
  let game, pointer=null, keys=new Set(), particles=[], labels=[], rings=[], shake=0;
  let clock=0, uiTimer=0, toastTimer=0, chapterTimer=0, rockHint=0, mapOpen=true;
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
    const now=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,now);g.gain.setValueAtTime(volume,now);
    g.gain.exponentialRampToValueAtTime(.001,now+duration);o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+duration);
    o.onended=()=>{o.disconnect();g.disconnect();};
  }
  function chord() {[392,494,587,784].forEach((f,i)=>note(f,.4,'sine',.04,i*.09));}
  function toast(message,time=3.5) {$('#toast').textContent=message;$('#toast').style.opacity=1;toastTimer=time;}
  function announce(name) {$('#chapter strong').textContent=name;$('#chapter').style.opacity=1;chapterTimer=3;}
  function clearInput() {pointer=null;keys.clear();}
  function showPanel(html) {
    clearInput();$('#panel').innerHTML=html;$('#overlay').classList.remove('hidden');
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
    showPanel('<span class="eyebrow">DEN SOVANDE SOLEN</span><h1 id="panel-title">DJUPT<br><em>UNDER</em></h1>'+
      '<p class="tagline">Något där nere väntar på att väckas.</p>'+
      '<p>Tre uråldriga reliker. En förmögenhet i diamanter.<br>Och enorma ormar som följer dina tunnlar.</p>'+
      '<div class="pill-row"><span><b>↯</b> Borra genom sten</span><span><b>✦</b> Bedöva med bloss</span><span><b>◆</b> Säkra fynd och uppgradera</span></div>'+
      '<button id="start" class="primary">Börja expeditionen ↘</button>'+
      '<div class="instructions">HÅLL ETT FINGER FÖR ATT GÅ OCH GRÄVA · ETT ANDRA FÖR VERKTYG<br>MUS ELLER WASD / PILTANGENTER · MELLANSLAG FÖR BORR · F FÖR BLOSS</div>'+
      (saved.runs>0?shopHTML():'<div class="panel-note">Återvänd till ytan när du vill för att säkra dina diamanter.</div>')+
      (!storageOK?'<div class="panel-note">Uppgraderingarna sparas under det här besöket. Webbläsaren kan inte spara dem till nästa gång.</div>':''));
    $('#start').addEventListener('click',start);bindShop(camp);
  }
  function start() {
    unlockAudio();game=new E.Game(Date.now()^Math.floor(Math.random()*1e9),saved.upgrades);game.start();
    particles=[];labels=[];rings=[];shake=0;clearInput();hidePanel();updateHUD();drawMap();
    toast('Håll i en riktning för att gräva. Följ ◇ till den första reliken.',5);
  }
  function pause() {
    if(game.state!=='playing')return;game.pause();clearInput();
    showPanel('<span class="eyebrow">EXPEDITIONEN ÄR PAUSAD</span><h2 id="panel-title">Ta ett andetag.</h2>'+
      '<p>Håll i en riktning för att gå. Borren tar dig genom sten och ormar. Bloss bedövar ormar i närheten och lockar bort andra.</p>'+
      '<p>Samla de tre relikerna, eller återvänd till ytan tidigare för att säkra dina fynd. Förrådskistor ger dig ett hjärta och ett bloss.</p>'+
      '<div class="run-perks">'+[...game.perks].map(id=>E.PERKS.find(p=>p.id===id).name).join(' · ')+'</div>'+
      '<button id="resume" class="primary">Fortsätt utforska</button>');
    $('#resume').addEventListener('click',()=>{unlockAudio();game.resume();hidePanel();});
  }
  function chooseRelic(event) {
    showPanel('<span class="eyebrow">RELIK '+game.player.relics+' AV 3 HITTAD</span><h2 id="panel-title">'+event.name+'</h2>'+
      '<p>Reliken delar med sig av sin kraft. Välj en gåva för den här expeditionen.</p>'+
      '<div class="choices">'+game.choices.map(p=>'<button class="choice" data-perk="'+p.id+'"><span class="perk-icon">'+p.icon+'</span><strong>'+p.name+'</strong><small>'+p.text+'</small></button>').join('')+'</div>'+
      '<p class="instructions">+30 DIAMANTER · TVÅ HJÄRTAN ÅTERSTÄLLDA · GROTTOR I NÄRHETEN AVSLÖJADE</p>');
    document.querySelectorAll('[data-perk]').forEach(b=>b.addEventListener('click',()=>{
      unlockAudio();if(!game.choose(b.dataset.perk))return;hidePanel();chord();updateHUD();
      if(game.player.relics===3){announce('Solen har vaknat. Spring.');toast('Alla ormar känner av den. Ta relikerna till ytan!',6);}
      else toast('En ny kraft. Ett djupare mysterium.');
    }));
  }
  function results(event) {
    saved.bank+=event.earned;saved.runs++;saved.best=Math.max(saved.best,event.earned);if(event.complete)saved.wins++;persist();
    const render=()=>{
      showPanel('<span class="eyebrow">'+(event.complete?'SOLEN ÅTERVÄNDER':event.escaped?'TILLBAKA I BASLÄGRET':'RÄDDNINGEN ÄR HÄR')+'</span>'+
        '<h2 id="panel-title">'+(event.complete?'Du tog ljuset med dig hem.':event.escaped?'Lite rikare. Lite klokare.':'Djupet behåller sina hemligheter.')+'</h2>'+
        '<p>'+(event.complete?'Tre reliker är återförenade. Underjorden väntar på ditt nästa äventyr.':event.escaped?'Dina diamanter är i trygghet. Uppgradera utrustningen och ge dig ner i en ny grotta.':'Räddarna fick med sig en fjärdedel av dina diamanter. Rusta dig och prova en ny väg.')+'</p>'+
        '<div class="run-stats"><div><strong>◆ '+event.earned+'</strong><small>SPARADE</small></div><div><strong>'+event.depth+'m</strong><small>DJUPASTE</small></div><div><strong>'+event.relics+'/3</strong><small>RELIKER</small></div></div>'+
        shopHTML()+'<button id="again" class="primary">En ny expedition ↘</button><div class="panel-note">Bästa fynd: '+saved.best+' · '+Math.floor(event.seconds/60)+'m '+event.seconds%60+'s under jord'+(!storageOK?' · Framstegen sparas under det här besöket':'')+'</div>');
      $('#again').addEventListener('click',start);bindShop(render);
    };render();
  }
  function burst(x,y,color,count=12) {
    for(let i=0;i<count;i++)particles.push({x:x*T+T/2,y:y*T+T/2,vx:(Math.random()-.5)*150,vy:(Math.random()-.6)*150,life:.4+Math.random()*.4,max:.8,color,size:2+Math.random()*3});
    if(particles.length>180)particles.splice(0,particles.length-180);
  }
  function events() {
    for(const event of game.drainEvents()) {
      const p=game.player;
      if(event.type==='dig'){burst(event.x,event.y,E.BIOMES[E.biomeAt(event.y)].soil[2],event.drill?8:4);if(event.drill)shake=.08;}
      if(event.type==='gem') {
        burst(event.x,event.y,'#89f5d1',8);labels.push({x:event.x*T+18,y:event.y*T,text:'+'+event.amount,color:'#b4ffe1',life:1});
        note([523,587,659,784,880][event.combo%5],.12,'sine',.025);
      }
      if(event.type==='chest'){burst(event.x,event.y,'#f8cd75',22);toast('Förrådskista! +'+event.amount+' diamanter, +1 bloss, +1 hjärta');chord();}
      if(event.type==='rock'&&rockHint<=0){toast('Hård sten. Tryck på Turboborra för att ta dig igenom.');rockHint=4;}
      if(event.type==='drill'){shake=.18;note(110,.3,'sawtooth',.025);}
      if(event.type==='flare'){burst(event.x,event.y,'#ffb980',28);rings.push({x:p.x*T+18,y:p.y*T+18,r:12,life:1,color:'#ffc490'});note(220,.3,'triangle');}
      if(event.type==='hurt'){shake=.4;burst(p.x,p.y,'#ed997d',20);toast('Ormbett! Borra dig bort eller tänd ett bloss.',2);note(85,.35,'sawtooth',.035);}
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
        const buttons=[...$('#panel').querySelectorAll('button:not(:disabled)')],first=buttons[0],lastButton=buttons[buttons.length-1];
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
    setText('relics','◆'.repeat(p.relics)+'◇'.repeat(3-p.relics));
    const dx=target.x-p.x,dy=target.y-p.y,arrow=Math.abs(dx)>Math.abs(dy)?(dx>0?'→':'←'):(dy>0?'↓':'↑');
    setText('objective',arrow+' '+target.name+' · '+Math.round(Math.hypot(dx,dy)*2)+'m');
    setText('gems',p.bag);setText('combo',game.combo>=5?'×'+Math.min(4,1+Math.floor(game.combo/5))+' DIAMANTSVIT':'');
    setText('flare-count',p.flares);elements.flare.disabled=p.flares<1||game.state!=='playing';
    elements.drill.disabled=p.drillCooldown>0||game.state!=='playing';
    setText('drill-label',p.drillCooldown>0?'LADDAR '+p.drillCooldown.toFixed(1)+'s':'REDO');
    const maximum=Math.max(2.4,7-saved.upgrades.boots)*(game.perks.has('drill')?.5:1);
    elements.recharge.style.width=(1-p.drillCooldown/maximum)*100+'%';
    elements.bank.classList.toggle('hidden',!(game.state==='playing'&&p.y===E.SURFACE&&p.bag>0));
    elements.threat.classList.toggle('hidden',!game.threat||game.state!=='playing');
  }
  function drawMap() {
    if(!mapOpen)return;mctx.fillStyle='#10221e';mctx.fillRect(0,0,116,192);
    for(let y=0;y<E.HEIGHT;y++)for(let x=0;x<E.WIDTH;x++)if(game.seen[E.key(x,y)]) {
      mctx.fillStyle=y<=E.SURFACE?'#6d9364':game.grid[y][x]===0?'#8b9871':E.BIOMES[E.biomeAt(y)].soil[0];mctx.fillRect(x*2,y*2,2,2);
    }
    for(const r of game.relics){mctx.fillStyle=r.taken?'#87946b':'#f6cc7d';mctx.save();mctx.translate(r.x*2+1,r.y*2+1);mctx.rotate(Math.PI/4);mctx.fillRect(-2,-2,4,4);mctx.restore();}
    const p=game.player;mctx.fillStyle='#fff6ce';mctx.beginPath();mctx.arc(p.x*2+1,p.y*2+1,2.5,0,7);mctx.fill();
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
    if(!game.seen[E.key(x,y)]){ctx.fillStyle='#14201c';ctx.fillRect(xx,yy,T+1,T+1);return;}
    if(type!==0) {
      ctx.fillStyle=type===2?'#66716b':b.soil[Math.floor(n*3)];ctx.fillRect(xx,yy,T+1,T+1);
      ctx.fillStyle='#00000024';ctx.fillRect(xx,yy,T,2);ctx.fillRect(xx,yy,1,T);
      if(game.grid[y-1]?.[x]===0){ctx.fillStyle=type===2?'#a3aaa0':'#c6ac7655';ctx.fillRect(xx,yy,T,4);}
      if(game.grid[y]?.[x-1]===0){ctx.fillStyle='#00000040';ctx.fillRect(xx,yy,4,T);}
      ctx.fillStyle='#d8bb8333';ctx.fillRect(xx+4+n*18,yy+8,3,2);ctx.fillRect(xx+24,yy+25,2,2);
      if(type===2||n>.67){ctx.strokeStyle=type===2?'#b6c1b177':'#1a1e174a';ctx.lineWidth=type===2?2:1;ctx.beginPath();ctx.moveTo(xx+8,yy+3);ctx.lineTo(xx+15,yy+13);ctx.lineTo(xx+11,yy+20);ctx.lineTo(xx+25,yy+30);ctx.stroke();}
    } else {
      ctx.fillStyle=b.floor;ctx.fillRect(xx,yy,T+1,T+1);
      ctx.fillStyle='#aaa47822';ctx.fillRect(xx+7+n*10,yy+26,3,2);
      if(n>.85&&!game.items.has(E.key(x,y))) {
        if(E.biomeAt(y)===0){ctx.fillStyle='#718c5a';ctx.fillRect(xx+9,yy+23,2,7);ctx.fillStyle='#a2c780';ctx.beginPath();ctx.ellipse(xx+10,yy+21,6,3,0,0,7);ctx.fill();}
        else if(E.biomeAt(y)===1){ctx.fillStyle='#779bc266';ctx.beginPath();ctx.moveTo(xx+8,yy+32);ctx.lineTo(xx+11,yy+17);ctx.lineTo(xx+17,yy+30);ctx.fill();}
        else{ctx.fillStyle='#db855555';ctx.fillRect(xx+9,yy+28,9,1);}
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
    }
    const h=points[0],neck=points[1],angle=Math.atan2(h.y-neck.y,h.x-neck.x);
    ctx.save();ctx.translate(h.x,h.y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(3,0,19,14,0,0,7);ctx.fill();
    ctx.fillStyle=s.alert?'#ffebad':'#e9df9f';ctx.beginPath();ctx.arc(9,-8,4,0,7);ctx.arc(9,8,4,0,7);ctx.fill();ctx.fillStyle='#18271e';ctx.fillRect(9,-11,2,6);ctx.fillRect(9,5,2,6);
    if(Math.sin(clock*7)>0){ctx.strokeStyle='#e9a388';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(29,0);ctx.lineTo(34,-4);ctx.moveTo(29,0);ctx.lineTo(34,4);ctx.stroke();}ctx.restore();
    if(s.stun>0){ctx.fillStyle='#e1f6b7';ctx.font='17px Georgia';for(let i=0;i<3;i++)ctx.fillText('✦',h.x+Math.cos(clock*3+i*2.1)*24-6,h.y-24+Math.sin(clock*3+i*2.1)*7);}
    else if(s.alert){ctx.fillStyle='#ffb696';ctx.font='bold 17px Arial';ctx.fillText('!',h.x-3,h.y-25);}
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
    const swing=moving?Math.sin(clock*20)*.5:0;
    ctx.save();ctx.translate(facing*12,2);ctx.rotate(facing*(-.3+swing));ctx.strokeStyle='#c2cab7';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(facing*7,-13);ctx.moveTo(facing*1,-14);ctx.lineTo(facing*16,-9);ctx.stroke();ctx.restore();
    if(p.drilling){const d=E.DIRS[p.dir];ctx.translate(d.x*23,d.y*23);ctx.rotate(Math.atan2(d.y,d.x));ctx.fillStyle='#fff0af';ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(-3,-9);ctx.lineTo(-3,9);ctx.fill();}
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
    if(y0<5)campDrawing();temples();
    for(const item of game.items.values()) {
      if(item.x<x0||item.x>x1||item.y<y0||item.y>y1||!game.seen[E.key(item.x,item.y)])continue;
      const x=item.x*T+18,y=item.y*T+18;
      if(item.type==='gem'){ctx.shadowColor='#80e8c6';ctx.shadowBlur=6;diamond(x,y,7+item.value,'#8fefd0');ctx.shadowBlur=0;if(hash(item.x,item.y)>.6&&Math.sin(clock*3+item.x)>.8){ctx.fillStyle='#e7ffe7';ctx.fillRect(x+10,y-10,2,5);ctx.fillRect(x+8,y-8,6,1);}}
      else if(item.type==='chest'){ctx.fillStyle='#443c25';ctx.fillRect(x-13,y-7,26,22);ctx.fillStyle='#cda969';ctx.fillRect(x-13,y-10,26,13);ctx.fillStyle='#ffe0a0';ctx.fillRect(x-3,y-2,6,7);ctx.strokeStyle='#e9c181';ctx.lineWidth=2;ctx.strokeRect(x-13,y-10,26,25);}
      else{ctx.shadowColor='#f9d591';ctx.shadowBlur=23;diamond(x,y-7+Math.sin(clock*2)*5,17,E.BIOMES[E.biomeAt(item.y)].color);ctx.shadowBlur=0;}
    }
    for(const s of game.snakes)drawSnake(s);
    for(const f of game.flares) {
      const x=f.x*T+18,y=f.y*T+18,g=ctx.createRadialGradient(x,y,4,x,y,150);g.addColorStop(0,'#f4ae6855');g.addColorStop(1,'#e49c5200');ctx.fillStyle=g;ctx.fillRect(x-150,y-150,300,300);
      ctx.fillStyle='#ffde91';ctx.beginPath();ctx.arc(x,y,6+Math.sin(clock*15)*2,0,7);ctx.fill();ctx.fillStyle='#fff6d8';ctx.fillRect(x-2,y-9,4,15);
    }
    drawMiner(px,py);
    for(const effect of particles){ctx.globalAlpha=Math.min(1,effect.life*2);ctx.fillStyle=effect.color;ctx.fillRect(effect.x,effect.y,effect.size,effect.size);}ctx.globalAlpha=1;
    for(const ring of rings){ctx.globalAlpha=ring.life;ctx.strokeStyle=ring.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(ring.x,ring.y,ring.r,0,7);ctx.stroke();}ctx.globalAlpha=1;
    for(const label of labels){ctx.globalAlpha=Math.min(1,label.life*2);ctx.fillStyle=label.color;ctx.font='bold 16px Arial';ctx.fillText(label.text,label.x,label.y);}ctx.globalAlpha=1;
    // Previously explored edges stay visible; undiscovered caves conceal their inhabitants.
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(y>E.SURFACE&&!game.seen[E.key(x,y)]){ctx.fillStyle='#14201c';ctx.fillRect(x*T,y*T,T+1,T+1);}
    ctx.restore();
    const glow=ctx.createRadialGradient(px-camera.x,py-camera.y,70,px-camera.x,py-camera.y,Math.max(330,width*.65));
    glow.addColorStop(0,'#07161000');glow.addColorStop(1,'#071610b0');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    if(p.relics===3){ctx.strokeStyle='#f5bd5744';ctx.lineWidth=4;ctx.strokeRect(2,2,width-4,height-4);}
    if(pointer&&game.state==='playing') {
      const r=canvas.getBoundingClientRect(),x=(pointer.x-r.left)/scale,y=(pointer.y-r.top)/scale;
      ctx.strokeStyle='#f5d99799';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,16,0,7);ctx.stroke();ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.stroke();
    }
  }
  function frame(time) {
    const dt=Math.min(.05,(time-last)/1000);last=time;clock+=dt;
    game.update(dt,direction());events();shake=Math.max(0,shake-dt);rockHint=Math.max(0,rockHint-dt);
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
